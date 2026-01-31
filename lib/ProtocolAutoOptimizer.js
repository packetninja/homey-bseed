'use strict';

const { EventEmitter } = require('events');

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║          PROTOCOL AUTO-OPTIMIZER - v5.5.122                                  ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  Centralized hybrid protocol management for ALL drivers                      ║
 * ║                                                                              ║
 * ║  FEATURES:                                                                   ║
 * ║  1. Listens to BOTH Tuya DP AND Zigbee ZCL protocols                         ║
 * ║  2. After 15 minutes, identifies which protocol actually works               ║
 * ║  3. LEARNS which capabilities the device supports                            ║
 * ║  4. Auto-adds capabilities when detected from data                           ║
 * ║  5. Handles exotic Chinese implementations gracefully                        ║
 * ║                                                                              ║
 * ║  v5.5.122 ENHANCEMENTS:                                                      ║
 * ║  - Capability discovery tracking                                             ║
 * ║  - Learning report after 15 minutes                                          ║
 * ║  - Protocol statistics per capability                                        ║
 * ║  - Event: 'learning_complete' with discovered features                       ║
 * ║                                                                              ║
 * ║  USAGE:                                                                      ║
 * ║  const optimizer = new ProtocolAutoOptimizer(device);                        ║
 * ║  await optimizer.initialize(zclNode);                                        ║
 * ║                                                                              ║
 * ║  // Register data hits from your listeners:                                  ║
 * ║  optimizer.registerHit('tuya', dpId, value, capability);                     ║
 * ║  optimizer.registerHit('zcl', clusterName, value, capability);               ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// Optimization decision time (15 minutes)
const DECISION_DELAY_MS = 15 * 60 * 1000;

// Protocol types
const PROTOCOL = {
  TUYA: 'tuya',
  ZCL: 'zcl',
  IAS: 'ias',
  RAW: 'raw',
};

class ProtocolAutoOptimizer extends EventEmitter {

  constructor(device, options = {}) {
    super();
    this.device = device;
    this.options = {
      decisionDelay: options.decisionDelay || DECISION_DELAY_MS,
      verbose: options.verbose !== false,
      persistDecision: options.persistDecision !== false,
      ...options
    };

    // Protocol statistics
    this.stats = {
      tuya: { hits: 0, lastHit: null, dps: new Set() },
      zcl: { hits: 0, lastHit: null, clusters: new Set() },
      ias: { hits: 0, lastHit: null },
      raw: { hits: 0, lastHit: null },
    };

    // v5.5.122: Capability discovery tracking
    this.discoveredCapabilities = new Map(); // capability -> { protocol, identifier, firstSeen, hits }
    this.protocolPerCapability = new Map(); // capability -> preferred protocol

    // Protocol active states
    this.active = {
      tuya: true,
      zcl: true,
      ias: true,
      raw: true,
    };

    // Decision state
    this.decided = false;
    this.decidedMode = null;
    this.decisionTimeout = null;
    this.startTime = Date.now();

    this._log('Created - v5.5.122 with capability learning');
  }

  _log(...args) {
    if (this.options.verbose && this.device?.log) {
      this.device.log('[AUTO-OPT]', ...args);
    }
  }

  /**
   * Initialize the optimizer
   */
  async initialize(zclNode) {
    // Check for saved decision
    if (this.options.persistDecision) {
      const saved = await this._loadSavedDecision();
      if (saved) {
        this._log(`Protocol: ${saved} (saved)`);
        this._applyDecision(saved, false);
        return;
      }
    }

    // Schedule decision
    this._scheduleDecision();

    if (this.options.verbose) {
      this._log(`Protocol optimizer: Learning mode (${this.options.decisionDelay / 60000} min)`);
    }
  }

  /**
   * Register a hit for a protocol
   * Call this whenever you receive data from any protocol
   * v5.5.122: Added capability parameter for learning
   */
  registerHit(protocol, identifier, value, capability = null) {
    if (!this.stats[protocol]) {
      this._log(`⚠️ Unknown protocol: ${protocol}`);
      return;
    }

    const stat = this.stats[protocol];
    stat.hits++;
    stat.lastHit = Date.now();

    // Track specific identifiers
    if (protocol === 'tuya' && identifier) {
      stat.dps.add(identifier);
    } else if (protocol === 'zcl' && identifier) {
      stat.clusters.add(identifier);
    }

    // v5.5.122: Track capability discovery
    if (capability) {
      this._trackCapabilityDiscovery(protocol, identifier, capability);
    }

    // Emit event
    this.emit('hit', protocol, identifier, value, capability);
  }

  /**
   * v5.5.122: Track capability discovery from protocol data
   */
  _trackCapabilityDiscovery(protocol, identifier, capability) {
    const key = capability;

    if (!this.discoveredCapabilities.has(key)) {
      // First time seeing this capability
      this.discoveredCapabilities.set(key, {
        protocol,
        identifier,
        firstSeen: Date.now(),
        hits: 1,
        sources: [{ protocol, identifier, hits: 1 }]
      });

      // Emit discovery event
      this.emit('capability_discovered', capability, protocol, identifier);
    } else {
      // Update existing
      const data = this.discoveredCapabilities.get(key);
      data.hits++;

      // Track if multiple protocols provide same capability
      let found = data.sources.find(s => s.protocol === protocol && s.identifier === identifier);
      if (found) {
        found.hits++;
      } else {
        data.sources.push({ protocol, identifier, hits: 1 });
      }
    }
  }

  /**
   * v5.5.122: Get discovered capabilities report
   */
  getDiscoveredCapabilities() {
    const report = [];
    for (const [capability, data] of this.discoveredCapabilities) {
      // Determine best protocol (most hits)
      const bestSource = data.sources.sort((a, b) => b.hits - a.hits)[0];
      report.push({
        capability,
        primaryProtocol: bestSource.protocol,
        primaryIdentifier: bestSource.identifier,
        totalHits: data.hits,
        sources: data.sources
      });
    }
    return report;
  }

  /**
   * Check if a protocol is still active (not paused)
   */
  isActive(protocol) {
    return this.active[protocol] !== false;
  }

  /**
   * Get current protocol mode
   */
  getMode() {
    if (!this.decided) return 'hybrid';
    return this.decidedMode;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      decided: this.decided,
      mode: this.decidedMode,
      elapsed: Date.now() - this.startTime,
      protocols: { ...this.stats },
      active: { ...this.active },
    };
  }

  /**
   * Schedule the decision after delay
   */
  _scheduleDecision() {
    if (this.decisionTimeout) {
      clearTimeout(this.decisionTimeout);
    }

    this.decisionTimeout = this.device?.homey?.setTimeout?.(() => {
      this._makeDecision();
    }, this.options.decisionDelay) || setTimeout(() => {
      this._makeDecision();
    }, this.options.decisionDelay);
  }

  /**
   * Make the optimization decision
   * v5.5.122: Enhanced with capability learning report
   */
  _makeDecision() {
    // Determine the best mode
    const tuyaActive = this.stats.tuya.hits > 0;
    const zclActive = this.stats.zcl.hits > 0;
    const iasActive = this.stats.ias.hits > 0;

    let mode;
    if (tuyaActive && !zclActive && !iasActive) {
      mode = 'tuya_only';
    } else if (!tuyaActive && (zclActive || iasActive)) {
      mode = 'zcl_only';
    } else if (tuyaActive && (zclActive || iasActive)) {
      mode = 'hybrid';
    } else {
      mode = 'unknown';
    }

    if (this.options.verbose) {
      this._log(`Protocol decision: ${mode} (Tuya: ${this.stats.tuya.hits}, ZCL: ${this.stats.zcl.hits})`);
    }

    this._applyDecision(mode, true);

    // Emit decision event
    this.emit('decision', mode, this.getStats());

    // v5.5.122: Emit learning complete
    const discoveredCaps = this.getDiscoveredCapabilities();
    this.emit('learning_complete', {
      mode,
      stats: this.getStats(),
      capabilities: discoveredCaps,
      elapsedMinutes: Math.round((Date.now() - this.startTime) / 60000)
    });
  }

  /**
   * Apply a decision
   * v5.5.71: NEVER fully disable any protocol - they must remain able to receive passive data
   */
  _applyDecision(mode, save = true) {
    this.decided = true;
    this.decidedMode = mode;

    // v5.5.71: CRITICAL FIX - NEVER disable protocols completely
    // Both Tuya and ZCL must remain active to receive passive/unsolicited data
    // Only "active queries" should be controlled by this, not passive listeners
    switch (mode) {
    case 'tuya_only':
      this.active.tuya = true;
      this.active.zcl = true;  // v5.5.71: Keep ZCL active for passive data
      this.active.ias = true;  // v5.5.71: Keep IAS active
      break;

    case 'zcl_only':
      this.active.tuya = true;  // v5.5.71: CRITICAL - Keep Tuya active for passive data!
      this.active.zcl = true;
      this.active.ias = true;
      break;

    case 'hybrid':
      this.active.tuya = true;
      this.active.zcl = true;
      this.active.ias = true;
      break;

    default:
      // No data received - keep all active
      break;
    }

    // Save decision
    if (save && this.options.persistDecision) {
      this._saveDecision(mode);
    }
  }

  /**
   * Force a specific mode (manual override)
   */
  forceMode(mode) {
    this._log(`🔧 Force mode: ${mode}`);
    this._applyDecision(mode, true);
  }

  /**
   * Reset to hybrid mode
   */
  reset() {
    this._log('🔄 Resetting to hybrid mode');
    this.decided = false;
    this.decidedMode = null;
    this.active = { tuya: true, zcl: true, ias: true, raw: true };
    this.stats = {
      tuya: { hits: 0, lastHit: null, dps: new Set() },
      zcl: { hits: 0, lastHit: null, clusters: new Set() },
      ias: { hits: 0, lastHit: null },
      raw: { hits: 0, lastHit: null },
    };
    this.startTime = Date.now();
    this._scheduleDecision();
  }

  /**
   * Save decision to device store
   */
  async _saveDecision(mode) {
    try {
      const CURRENT_VERSION = 2; // v5.5.71: Version for decision compatibility
      await this.device?.setStoreValue?.('protocol_mode', mode);
      await this.device?.setStoreValue?.('protocol_decision_time', Date.now());
      await this.device?.setStoreValue?.('protocol_decision_version', CURRENT_VERSION);
      this._log(`💾 Saved decision: ${mode} (v${CURRENT_VERSION})`);
    } catch (e) {
      this._log('⚠️ Could not save decision:', e.message);
    }
  }

  /**
   * Load saved decision from device store
   * v5.5.71: Added version check to invalidate old bad decisions
   */
  async _loadSavedDecision() {
    try {
      const mode = await this.device?.getStoreValue?.('protocol_mode');
      const time = await this.device?.getStoreValue?.('protocol_decision_time');
      const version = await this.device?.getStoreValue?.('protocol_decision_version');

      // v5.5.71: Invalidate decisions made before v5.5.71 (they may have disabled Tuya wrongly)
      const CURRENT_VERSION = 2; // Bump this to invalidate old decisions
      if (version !== CURRENT_VERSION) {
        this._log('🔄 Invalidating old decision (pre-v5.5.71) - relearning...');
        return null;
      }

      // Expire after 24 hours (reduced from 7 days)
      if (mode && time && (Date.now() - time) < 24 * 60 * 60 * 1000) {
        return mode;
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.decisionTimeout) {
      clearTimeout(this.decisionTimeout);
      this.decisionTimeout = null;
    }
    this.removeAllListeners();
  }
}

// Export
module.exports = ProtocolAutoOptimizer;
module.exports.PROTOCOL = PROTOCOL;
module.exports.DECISION_DELAY_MS = DECISION_DELAY_MS;

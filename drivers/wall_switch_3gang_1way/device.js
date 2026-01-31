'use strict';
const HybridSwitchBase = require('../../lib/devices/HybridSwitchBase');
const PhysicalButtonMixin = require('../../lib/mixins/PhysicalButtonMixin');
const VirtualButtonMixin = require('../../lib/mixins/VirtualButtonMixin');

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   WALL SWITCH 3-GANG 1-WAY - HybridSwitchBase + Physical + Virtual Buttons  ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Uses HybridSwitchBase which provides:                                       ║
 * ║  - Auto-detection of Tuya DP vs ZCL mode                                     ║
 * ║  - ZCL onOff cluster support for multi-gang switches                         ║
 * ║  - Tuya DP support for settings (backlight, etc.)                            ║
 * ║  - ProtocolAutoOptimizer for automatic protocol detection                    ║
 * ║                                                                               ║
 * ║  PhysicalButtonMixin provides:                                               ║
 * ║  - Physical button press detection (single, double, triple, long)            ║
 * ║  - Per-gang button detection                                                 ║
 * ║                                                                               ║
 * ║  VirtualButtonMixin provides:                                                ║
 * ║  - Virtual button support for advanced automations                           ║
 * ║                                                                               ║
 * ║  Compatible with devices: TS0003 (_TZ3000_qkixdnon)                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
class WallSwitch3Gang1WayDevice extends PhysicalButtonMixin(VirtualButtonMixin(HybridSwitchBase)) {

  get gangCount() { return 3; }

  /**
   * EXTEND parent dpMappings for 3-gang configuration
   */
  get dpMappings() {
    const parentMappings = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).dpMappings || {};
    return {
      ...parentMappings,
      // 3-gang switches use DP 1, 2, and 3 for gang 1, 2, and 3
      1: { capability: 'onoff', transform: (v) => v === 1 || v === true },
      2: { capability: 'onoff.gang2', transform: (v) => v === 1 || v === true },
      3: { capability: 'onoff.gang3', transform: (v) => v === 1 || v === true }
    };
  }

  async onNodeInit({ zclNode }) {
    this.log('╔════════════════════════════════════════╗');
    this.log('║  Wall Switch 3-Gang 1-Way initializing ║');
    this.log('╚════════════════════════════════════════╝');

    // Track state for detecting physical button presses
    this._lastOnoffState = { gang1: null, gang2: null, gang3: null };
    this._appCommandPending = { gang1: false, gang2: false, gang3: false };
    this._appCommandTimeout = { gang1: null, gang2: null, gang3: null };

    // Let parent HybridSwitchBase handle protocol auto-detection
    await super.onNodeInit({ zclNode });

    // Initialize physical button detection for all gangs
    await this.initPhysicalButtonDetection(zclNode);

    // Apply gang names
    await this._applyGangNames();

    this.log('[SWITCH-3G] ✅ Initialization complete');
  }

  /**
   * Apply gang names from settings
   */
  async _applyGangNames() {
    const gang1Name = this.getSetting('gang1_name') || 'Gang 1';
    const gang2Name = this.getSetting('gang2_name') || 'Gang 2';
    const gang3Name = this.getSetting('gang3_name') || 'Gang 3';

    this.log(`Applying gang names: "${gang1Name}", "${gang2Name}", and "${gang3Name}"`);

    try {
      await this.setCapabilityOptions('onoff', { title: gang1Name });
      await this.setCapabilityOptions('onoff.gang2', { title: gang2Name });
      await this.setCapabilityOptions('onoff.gang3', { title: gang3Name });
      this.log('✅ Gang names applied');
    } catch (err) {
      this.error('Failed to apply gang names:', err);
    }
  }

}

module.exports = WallSwitch3Gang1WayDevice;

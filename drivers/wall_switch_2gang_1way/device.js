'use strict';
const HybridSwitchBase = require('../../lib/devices/HybridSwitchBase');
const PhysicalButtonMixin = require('../../lib/mixins/PhysicalButtonMixin');
const VirtualButtonMixin = require('../../lib/mixins/VirtualButtonMixin');

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   WALL SWITCH 2-GANG 1-WAY - HybridSwitchBase + Physical + Virtual Buttons  ║
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
 * ║  Compatible with BSEED devices: _TZ3000_xk5udnd6, _TZ3000_l9brjwau          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
class WallSwitch2Gang1WayDevice extends PhysicalButtonMixin(VirtualButtonMixin(HybridSwitchBase)) {

  get gangCount() { return 2; }

  /**
   * EXTEND parent dpMappings for 2-gang configuration
   */
  get dpMappings() {
    const parentMappings = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).dpMappings || {};
    return {
      ...parentMappings,
      // 2-gang switches use DP 1 and 2 for gang 1 and 2
      1: { capability: 'onoff', transform: (v) => v === 1 || v === true },
      2: { capability: 'onoff.gang2', transform: (v) => v === 1 || v === true }
    };
  }

  async onNodeInit({ zclNode }) {
    this.log('╔════════════════════════════════════════╗');
    this.log('║  Wall Switch 2-Gang 1-Way initializing ║');
    this.log('╚════════════════════════════════════════╝');

    // Track state for detecting physical button presses
    this._lastOnoffState = { gang1: null, gang2: null };
    this._appCommandPending = { gang1: false, gang2: false };
    this._appCommandTimeout = { gang1: null, gang2: null };

    // Let parent HybridSwitchBase handle protocol auto-detection
    await super.onNodeInit({ zclNode });

    // Initialize physical button detection for both gangs
    await this.initPhysicalButtonDetection(zclNode);

    // Apply gang names
    await this._applyGangNames();

    this.log('[SWITCH-2G] ✅ Initialization complete');
  }

  /**
   * Apply gang names from settings
   */
  async _applyGangNames() {
    const gang1Name = this.getSetting('gang1_name') || 'Gang 1';
    const gang2Name = this.getSetting('gang2_name') || 'Gang 2';

    this.log(`Applying gang names: "${gang1Name}" and "${gang2Name}"`);

    try {
      await this.setCapabilityOptions('onoff', { title: gang1Name });
      await this.setCapabilityOptions('onoff.gang2', { title: gang2Name });
      this.log('✅ Gang names applied');
    } catch (err) {
      this.error('Failed to apply gang names:', err);
    }
  }

}

module.exports = WallSwitch2Gang1WayDevice;

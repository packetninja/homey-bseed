'use strict';
const HybridSwitchBase = require('../../lib/devices/HybridSwitchBase');
const PhysicalButtonMixin = require('../../lib/mixins/PhysicalButtonMixin');
const VirtualButtonMixin = require('../../lib/mixins/VirtualButtonMixin');

/**
 * Wall Switch 2-Gang 1-Way
 * Force explicit ZCL endpoint handling for TS0012/TS0003 devices
 */

class WallSwitch2Gang1WayDevice extends PhysicalButtonMixin(VirtualButtonMixin(HybridSwitchBase)) {

  get gangCount() { return 2; }

  /**
   * Helper: Write debug info to device settings (visible to user)
   */
  async _updateDebugInfo(key, value) {
    try {
      const timestamp = new Date().toLocaleTimeString();
      await this.setSettings({ [key]: `${value} (${timestamp})` });
    } catch (err) {
      // Ignore settings update errors during init
    }
  }

  async onNodeInit({ zclNode }) {
    this.log('╔════════════════════════════════════════════════════════════╗');
    this.log('║  Wall Switch 2-Gang 1-Way initializing...                 ║');
    this.log(`║  Manufacturer: ${(this.getStoreValue('manufacturerName') || 'unknown').padEnd(37)}║`);
    this.log(`║  Model: ${(this.getStoreValue('modelId') || 'unknown').padEnd(46)}║`);
    this.log('╚════════════════════════════════════════════════════════════╝');

    // Store zclNode for later use
    this.zclNode = zclNode;

    // Let parent HybridSwitchBase handle all protocol detection and setup
    await super.onNodeInit({ zclNode });

    // Detect and display protocol mode
    const isTuyaDP = this.getStoreValue('tuyaProtocol') === 'TUYA_DP';
    const protocolMode = isTuyaDP ? 'Tuya DP' : 'ZCL';
    await this._updateDebugInfo('debug_protocol', protocolMode);

    // Initialize physical button detection
    await this.initPhysicalButtonDetection(zclNode);

    // Initialize virtual buttons
    await this.initVirtualButtons();

    // Apply custom gang names
    await this._applyGangNames();

    // Update initial status
    await this._updateDebugInfo('debug_gang1_status', this.getCapabilityValue('onoff') ? 'ON' : 'OFF');
    await this._updateDebugInfo('debug_gang2_status', this.getCapabilityValue('onoff.gang2') ? 'ON' : 'OFF');
    await this._updateDebugInfo('debug_last_action', 'Device initialized');

    this.log('[SWITCH-2G] ✅ Initialization complete');
  }

  /**
   * OVERRIDE parent's _registerCapabilityListeners to force explicit endpoint routing
   * This method is called by parent's onNodeInit
   */
  _registerCapabilityListeners() {
    console.log('========================================');
    console.log('[SWITCH-2G] OVERRIDE: Explicit endpoint listeners');
    console.log('========================================');
    this.log('[SWITCH-2G] 🔧 OVERRIDE: Registering EXPLICIT endpoint-based capability listeners...');

    // Gang 1 - Endpoint 1 ONLY
    if (this.hasCapability('onoff')) {
      this.registerCapabilityListener('onoff', async (value) => {
        console.log(`🔵🔵🔵 GANG 1 COMMAND: ${value ? 'ON' : 'OFF'} → ENDPOINT 1 🔵🔵🔵`);
        this.log(`[SWITCH-2G] 🔵 Gang 1 → ${value ? 'ON' : 'OFF'} (endpoint 1)`);

        // Update debug settings
        await this._updateDebugInfo('debug_last_action', `Gang 1 ${value ? 'ON' : 'OFF'} → Endpoint 1`);
        await this._updateDebugInfo('debug_gang1_status', value ? 'ON' : 'OFF');

        const endpoint = this.zclNode?.endpoints?.[1];
        const cluster = endpoint?.clusters?.onOff || endpoint?.clusters?.genOnOff;

        console.log(`Endpoint 1 exists: ${!!endpoint}, Cluster exists: ${!!cluster}`);

        if (cluster) {
          await (value ? cluster.setOn() : cluster.setOff());
          console.log(`✅ Gang 1 sent to endpoint 1 ONLY`);
          this.log(`[SWITCH-2G] ✅ Gang 1 command sent to endpoint 1 ONLY`);
        } else {
          console.error('❌ No OnOff cluster on endpoint 1');
          this.error('[SWITCH-2G] ❌ No OnOff cluster on endpoint 1');
          await this._updateDebugInfo('debug_last_action', 'ERROR: No OnOff cluster on endpoint 1');
        }
        return true;
      });
      console.log('✅ onoff listener registered → endpoint 1');
      this.log('[SWITCH-2G] ✅ onoff → endpoint 1');
    }

    // Gang 2 - Endpoint 2 ONLY
    if (this.hasCapability('onoff.gang2')) {
      this.registerCapabilityListener('onoff.gang2', async (value) => {
        console.log(`🟠🟠🟠 GANG 2 COMMAND: ${value ? 'ON' : 'OFF'} → ENDPOINT 2 🟠🟠🟠`);
        this.log(`[SWITCH-2G] 🟠 Gang 2 → ${value ? 'ON' : 'OFF'} (endpoint 2)`);

        // Update debug settings
        await this._updateDebugInfo('debug_last_action', `Gang 2 ${value ? 'ON' : 'OFF'} → Endpoint 2`);
        await this._updateDebugInfo('debug_gang2_status', value ? 'ON' : 'OFF');

        const endpoint = this.zclNode?.endpoints?.[2];
        const cluster = endpoint?.clusters?.onOff || endpoint?.clusters?.genOnOff;

        console.log(`Endpoint 2 exists: ${!!endpoint}, Cluster exists: ${!!cluster}`);

        if (cluster) {
          await (value ? cluster.setOn() : cluster.setOff());
          console.log(`✅ Gang 2 sent to endpoint 2 ONLY`);
          this.log(`[SWITCH-2G] ✅ Gang 2 command sent to endpoint 2 ONLY`);
        } else {
          console.error('❌ No OnOff cluster on endpoint 2');
          this.error('[SWITCH-2G] ❌ No OnOff cluster on endpoint 2');
          await this._updateDebugInfo('debug_last_action', 'ERROR: No OnOff cluster on endpoint 2');
        }
        return true;
      });
      console.log('✅ onoff.gang2 listener registered → endpoint 2');
      this.log('[SWITCH-2G] ✅ onoff.gang2 → endpoint 2');
    }

    console.log('[SWITCH-2G] Capability listeners override complete');
    this.log('[SWITCH-2G] 🎯 Capability listeners override complete - endpoints isolated');
  }

  /**
   * Apply custom gang names to capability titles
   */
  async _applyGangNames() {
    try {
      const gang1Name = this.getSetting('gang1_name') || 'Gang 1';
      const gang2Name = this.getSetting('gang2_name') || 'Gang 2';

      this.log(`Applying gang names: "${gang1Name}" and "${gang2Name}"`);

      await this.setCapabilityOptions('onoff', {
        title: { en: gang1Name, nl: gang1Name }
      });

      await this.setCapabilityOptions('onoff.gang2', {
        title: { en: gang2Name, nl: gang2Name }
      });

      this.log(`✅ Gang names applied`);
    } catch (err) {
      this.error('Failed to apply gang names:', err);
    }
  }

  /**
   * Handle settings changes
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings changed:', changedKeys);

    // If gang names changed, update capability titles
    if (changedKeys.includes('gang1_name') || changedKeys.includes('gang2_name')) {
      await this._applyGangNames();
    }

    // If backlight mode changed, let parent handle it
    if (changedKeys.includes('backlight_mode')) {
      await super.onSettings({ oldSettings, newSettings, changedKeys });
    }
  }
}

module.exports = WallSwitch2Gang1WayDevice;

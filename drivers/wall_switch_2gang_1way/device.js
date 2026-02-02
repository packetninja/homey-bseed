'use strict';
const HybridSwitchBase = require('../../lib/devices/HybridSwitchBase');
const PhysicalButtonMixin = require('../../lib/mixins/PhysicalButtonMixin');
const VirtualButtonMixin = require('../../lib/mixins/VirtualButtonMixin');

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   WALL SWITCH 2-GANG 1-WAY - Sub-Device Implementation                      ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Creates TWO separate device cards in Homey:                                 ║
 * ║  - Primary Device: Gang 1 (uses full HybridSwitchBase)                       ║
 * ║  - Sub-Device: Gang 2 (minimal initialization, specific endpoint)            ║
 * ║                                                                               ║
 * ║  Benefits:                                                                    ║
 * ║  ✅ Natural voice control: "Turn on kitchen light"                           ║
 * ║  ✅ Zone assignment: Each gang in different zone/room                        ║
 * ║  ✅ Cleaner UI: Two separate device cards                                    ║
 * ║  ✅ Better automation: Target specific lights directly                       ║
 * ║                                                                               ║
 * ║  Compatible with: TS0012 devices on Homey 12.10.0+                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
class WallSwitch2Gang1WayDevice extends PhysicalButtonMixin(VirtualButtonMixin(HybridSwitchBase)) {

  get gangCount() {
    // Both primary and sub-device handle only 1 gang each
    // Primary = EP1, Sub-device = EP2
    return 1;
  }

  /**
   * EXTEND parent dpMappings for 2-gang configuration
   */
  get dpMappings() {
    const { subDeviceId } = this.getData();
    const parentMappings = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).dpMappings || {};

    // Sub-device uses DP 2 for its gang
    if (subDeviceId === 'secondSwitch') {
      return {
        ...parentMappings,
        2: { capability: 'onoff', transform: (v) => v === 1 || v === true }
      };
    }

    // Primary device uses DP 1 for gang 1 only (no gang2 capability)
    return {
      ...parentMappings,
      1: { capability: 'onoff', transform: (v) => v === 1 || v === true }
    };
  }

  async onNodeInit({ zclNode }) {
    const { subDeviceId } = this.getData();
    const isSubDevice = subDeviceId !== undefined;

    if (isSubDevice) {
      // SUB-DEVICE INITIALIZATION (Gang 2)
      // Get zclNode from store if not provided (happens when created programmatically)
      if (!zclNode) {
        const storedNode = this.getStore().zclNode;
        if (storedNode) {
          zclNode = storedNode;
        } else {
          this.error('[SUB-DEVICE] No zclNode available');
          return;
        }
      }
      await this._initSubDevice(zclNode, subDeviceId);
    } else {
      // PRIMARY DEVICE INITIALIZATION (Gang 1)
      await this._initPrimaryDevice(zclNode);
    }
  }

  /**
   * Initialize sub-device (Gang 2)
   * Bypasses HybridSwitchBase to avoid conflicts
   */
  async _initSubDevice(zclNode, subDeviceId) {
    this.log('╔════════════════════════════════════════╗');
    this.log('║  SUB-DEVICE: Gang 2 Initializing      ║');
    this.log('╚════════════════════════════════════════╝');

    // Determine which gang this sub-device represents
    const gangNumber = subDeviceId === 'secondSwitch' ? 2 : 1;
    this._gangNumber = gangNumber;
    this.zclNode = zclNode;

    // State tracking for pending commands
    this._zclState = {
      lastState: null,
      pending: false,
      timeout: null
    };

    // Get endpoint and cluster for THIS gang only
    const endpoint = zclNode.endpoints[gangNumber];
    const onOffCluster = endpoint?.clusters?.onOff;

    if (!onOffCluster) {
      this.error(`[SUB-DEVICE] No onOff cluster found on EP${gangNumber}`);
      return;
    }

    this.log(`[SUB-DEVICE] Using endpoint ${gangNumber} for Gang 2`);

    // Listen ONLY to this endpoint's attribute reports
    onOffCluster.on('attr.onOff', (value) => {
      const isPhysical = !this._zclState.pending;

      this.log(`[SUB-DEVICE] EP${gangNumber} attr.onOff=${value} (${isPhysical ? 'PHYSICAL' : 'APP'})`);

      // Update state
      if (this._zclState.lastState !== value) {
        this._zclState.lastState = value;
        this.setCapabilityValue('onoff', value).catch(this.error);

        // Trigger flow cards for physical button presses
        if (isPhysical) {
          // Try gang-specific flow card first
          const specificFlowCardId = `wall_switch_2gang_1way_gang${gangNumber}_turned_${value ? 'on' : 'off'}`;
          this.homey.flow.getDeviceTriggerCard(specificFlowCardId)
            .trigger(this, {}, {})
            .catch(() => {
              // If gang-specific doesn't exist, try generic
              const genericFlowCardId = `wall_switch_2gang_1way_turned_${value ? 'on' : 'off'}`;
              this.homey.flow.getDeviceTriggerCard(genericFlowCardId)
                .trigger(this, {}, {})
                .catch(() => {});
            });
        }
      }
    });

    // Register capability listener for app commands
    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`[SUB-DEVICE] Gang ${gangNumber} app command: ${value ? 'ON' : 'OFF'}`);

      // Set pending flag to detect this is an app command
      this._zclState.pending = true;
      clearTimeout(this._zclState.timeout);
      this._zclState.timeout = setTimeout(() => {
        this._zclState.pending = false;
      }, 2000);

      // Send command to correct endpoint
      await onOffCluster[value ? 'setOn' : 'setOff']();
      return true;
    });

    // Setup attribute reporting
    try {
      await onOffCluster.configureReporting({
        onOff: {
          minInterval: 0,
          maxInterval: 300,
          minChange: 1
        }
      });
      this.log(`[SUB-DEVICE] ✅ EP${gangNumber} onOff reporting configured`);
    } catch (err) {
      this.error('[SUB-DEVICE] Failed to configure reporting:', err);
    }

    // Read initial state
    try {
      const state = await onOffCluster.readAttributes(['onOff']);
      if (state.onOff !== undefined) {
        this._zclState.lastState = state.onOff;
        await this.setCapabilityValue('onoff', state.onOff);
        this.log(`[SUB-DEVICE] Initial state: ${state.onOff ? 'ON' : 'OFF'}`);
      }
    } catch (err) {
      this.error('[SUB-DEVICE] Failed to read initial state:', err);
    }

    this.log('[SUB-DEVICE] ✅ Gang 2 initialization complete');
  }

  /**
   * Initialize primary device (Gang 1)
   * Uses full HybridSwitchBase functionality
   */
  async _initPrimaryDevice(zclNode) {
    this.log('╔════════════════════════════════════════╗');
    this.log('║  PRIMARY DEVICE: Gang 1 Initializing  ║');
    this.log('╚════════════════════════════════════════╝');

    // Remove Gang 2 capability from primary device
    // (Gang 2 is now a separate device)
    if (this.hasCapability('onoff.gang2')) {
      await this.removeCapability('onoff.gang2').catch(() => {});
      this.log('[PRIMARY] Removed onoff.gang2 capability');
    }

    // Track state for detecting physical button presses
    this._lastOnoffState = { gang1: null };
    this._appCommandPending = { gang1: false };
    this._appCommandTimeout = { gang1: null };

    // Call parent initialization (HybridSwitchBase)
    // gangCount=2 means it will setup EP1 and EP2, but we only have onoff capability
    // so it will only register listener for EP1
    await super.onNodeInit({ zclNode });

    // Initialize physical button detection for Gang 1 only
    await this.initPhysicalButtonDetection(zclNode);

    // Create sub-device for Gang 2 if it doesn't exist
    await this._ensureSubDeviceExists().catch(err => {
      this.error('[PRIMARY] Failed to create sub-device:', err);
    });

    this.log('[PRIMARY] ✅ Gang 1 initialization complete');
  }

  /**
   * Ensure sub-device exists for Gang 2
   */
  async _ensureSubDeviceExists() {
    try {
      const driver = this.driver;
      const devices = driver.getDevices();

      // Check if sub-device already exists for this zclNode
      const hasSubDevice = devices.some(device => {
        const data = device.getData();
        return data.subDeviceId === 'secondSwitch' &&
               device.zclNode?.ieeeAddress === this.zclNode?.ieeeAddress;
      });

      if (hasSubDevice) {
        this.log('[PRIMARY] Sub-device already exists');
        return;
      }

      this.log('[PRIMARY] Creating sub-device for Gang 2...');

      // Create sub-device
      await driver.createDevice({
        name: `${this.getName()} - Gang 2`,
        data: {
          subDeviceId: 'secondSwitch'
        },
        store: {
          zclNode: this.zclNode
        }
      });

      this.log('[PRIMARY] ✅ Sub-device created successfully');
    } catch (err) {
      this.error('[PRIMARY] Error ensuring sub-device:', err);
    }
  }

}

module.exports = WallSwitch2Gang1WayDevice;

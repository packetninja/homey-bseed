'use strict';
const HybridSwitchBase = require('../../lib/devices/HybridSwitchBase');
const PhysicalButtonMixin = require('../../lib/mixins/PhysicalButtonMixin');
const VirtualButtonMixin = require('../../lib/mixins/VirtualButtonMixin');

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   WALL SWITCH 3-GANG 1-WAY - Sub-Device Implementation                      ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Creates THREE separate device cards in Homey:                               ║
 * ║  - Primary Device: Gang 1 (uses full HybridSwitchBase)                       ║
 * ║  - Sub-Device 1: Gang 2 (minimal initialization, specific endpoint)          ║
 * ║  - Sub-Device 2: Gang 3 (minimal initialization, specific endpoint)          ║
 * ║                                                                               ║
 * ║  Benefits:                                                                    ║
 * ║  ✅ Natural voice control: "Turn on kitchen light"                           ║
 * ║  ✅ Zone assignment: Each gang in different zone/room                        ║
 * ║  ✅ Cleaner UI: Three separate device cards                                  ║
 * ║  ✅ Better automation: Target specific lights directly                       ║
 * ║                                                                               ║
 * ║  Compatible with: TS0003 devices on Homey 12.10.0+                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
class WallSwitch3Gang1WayDevice extends PhysicalButtonMixin(VirtualButtonMixin(HybridSwitchBase)) {

  get gangCount() {
    // Each device handles only 1 gang/endpoint
    // Primary = EP1, Sub-device 1 = EP2, Sub-device 2 = EP3
    return 1;
  }

  /**
   * EXTEND parent dpMappings for 3-gang configuration
   */
  get dpMappings() {
    const { subDeviceId } = this.getData();
    const parentMappings = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(this))).dpMappings || {};

    // Sub-devices use their specific DP
    if (subDeviceId === 'secondSwitch') {
      return {
        ...parentMappings,
        2: { capability: 'onoff', transform: (v) => v === 1 || v === true }
      };
    }
    if (subDeviceId === 'thirdSwitch') {
      return {
        ...parentMappings,
        3: { capability: 'onoff', transform: (v) => v === 1 || v === true }
      };
    }

    // Primary device uses DP 1 for gang 1 only
    return {
      ...parentMappings,
      1: { capability: 'onoff', transform: (v) => v === 1 || v === true }
    };
  }

  async onNodeInit({ zclNode }) {
    const { subDeviceId } = this.getData();
    const isSubDevice = subDeviceId !== undefined;

    if (isSubDevice) {
      // SUB-DEVICE INITIALIZATION (Gang 2 or 3)
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
   * Initialize sub-device (Gang 2 or 3)
   * Bypasses HybridSwitchBase to avoid conflicts
   */
  async _initSubDevice(zclNode, subDeviceId) {
    const gangNumber = subDeviceId === 'secondSwitch' ? 2 : 3;
    const gangName = gangNumber === 2 ? 'Gang 2' : 'Gang 3';

    this.log('╔════════════════════════════════════════╗');
    this.log(`║  SUB-DEVICE: ${gangName} Initializing      ║`);
    this.log('╚════════════════════════════════════════╝');

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

    this.log(`[SUB-DEVICE] Using endpoint ${gangNumber} for ${gangName}`);

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
          const flowCardId = `wall_switch_3gang_1way_turned_${value ? 'on' : 'off'}_physical`;
          this.homey.flow.getDeviceTriggerCard(flowCardId)
            .trigger(this, {}, {})
            .catch(err => this.error('Failed to trigger flow card:', err));
        }
      }
    });

    // Register capability listener for app commands
    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`[SUB-DEVICE] ${gangName} app command: ${value ? 'ON' : 'OFF'}`);

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

    this.log(`[SUB-DEVICE] ✅ ${gangName} initialization complete`);
  }

  /**
   * Initialize primary device (Gang 1)
   * Uses full HybridSwitchBase functionality
   */
  async _initPrimaryDevice(zclNode) {
    this.log('╔════════════════════════════════════════╗');
    this.log('║  PRIMARY DEVICE: Gang 1 Initializing  ║');
    this.log('╚════════════════════════════════════════╝');

    // Remove Gang 2 and Gang 3 capabilities from primary device
    // (Gang 2 and 3 are now separate devices)
    if (this.hasCapability('onoff.gang2')) {
      await this.removeCapability('onoff.gang2').catch(() => {});
      this.log('[PRIMARY] Removed onoff.gang2 capability');
    }
    if (this.hasCapability('onoff.gang3')) {
      await this.removeCapability('onoff.gang3').catch(() => {});
      this.log('[PRIMARY] Removed onoff.gang3 capability');
    }

    // Track state for detecting physical button presses
    this._lastOnoffState = { gang1: null };
    this._appCommandPending = { gang1: false };
    this._appCommandTimeout = { gang1: null };

    // Call parent initialization (HybridSwitchBase)
    await super.onNodeInit({ zclNode });

    // Initialize physical button detection for Gang 1 only
    await this.initPhysicalButtonDetection(zclNode);

    // Create sub-devices for Gang 2 and 3 if they don't exist
    await this._ensureSubDevicesExist().catch(err => {
      this.error('[PRIMARY] Failed to create sub-devices:', err);
    });

    this.log('[PRIMARY] ✅ Gang 1 initialization complete');
  }

  /**
   * Ensure sub-devices exist for Gang 2 and 3
   */
  async _ensureSubDevicesExist() {
    try {
      const driver = this.driver;
      const devices = driver.getDevices();

      // Check which sub-devices already exist
      const hasSecondSwitch = devices.some(device => {
        const data = device.getData();
        return data.subDeviceId === 'secondSwitch' &&
               device.zclNode?.ieeeAddress === this.zclNode?.ieeeAddress;
      });

      const hasThirdSwitch = devices.some(device => {
        const data = device.getData();
        return data.subDeviceId === 'thirdSwitch' &&
               device.zclNode?.ieeeAddress === this.zclNode?.ieeeAddress;
      });

      // Create Gang 2 sub-device if needed
      if (!hasSecondSwitch) {
        this.log('[PRIMARY] Creating sub-device for Gang 2...');
        await driver.createDevice({
          name: `${this.getName()} - Gang 2`,
          data: {
            subDeviceId: 'secondSwitch'
          },
          store: {
            zclNode: this.zclNode
          }
        });
        this.log('[PRIMARY] ✅ Gang 2 sub-device created');
      } else {
        this.log('[PRIMARY] Gang 2 sub-device already exists');
      }

      // Create Gang 3 sub-device if needed
      if (!hasThirdSwitch) {
        this.log('[PRIMARY] Creating sub-device for Gang 3...');
        await driver.createDevice({
          name: `${this.getName()} - Gang 3`,
          data: {
            subDeviceId: 'thirdSwitch'
          },
          store: {
            zclNode: this.zclNode
          }
        });
        this.log('[PRIMARY] ✅ Gang 3 sub-device created');
      } else {
        this.log('[PRIMARY] Gang 3 sub-device already exists');
      }
    } catch (err) {
      this.error('[PRIMARY] Error ensuring sub-devices:', err);
    }
  }

}

module.exports = WallSwitch3Gang1WayDevice;

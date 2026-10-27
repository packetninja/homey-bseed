'use strict';

const TuyaSpecificClusterDevice = require('../../lib/tuya/TuyaSpecificClusterDevice');
const {CLUSTER} = require('zigbee-clusters');
const { TuyaCommandTracker } = require('../../lib/utils/TuyaCommandTracker');

// v5.5.755: PR #112 (packetninja) - Debug mode for detailed logging
// v5.5.799: Enhanced with settings support and robustness improvements
const DEBUG_MODE = false;

const dataPoints = {
  state: 1,
  brightness: 2,
  minBrightness: 3,
  countdown: 9,
  powerOnBehavior: 14,
  backlightMode: 15,        // Original - doesn't work for this device
  lightType: 16,
  backlightSwitch: 36,      // Alternative: Backlight on/off
  backlightLightMode: 37,   // Alternative: Light mode (none/relay/pos)
};

// v5.5.799: Light type enum values
const LIGHT_TYPES = {
  LED: 0,
  INCANDESCENT: 1,
  HALOGEN: 2
};

// v5.5.799: Power-on behavior enum values
const POWER_ON_BEHAVIOR = {
  OFF: 0,
  ON: 1,
  LAST_STATE: 2
};

class WallDimmer1Gang1Way extends TuyaSpecificClusterDevice {

  async onNodeInit({zclNode}) {
    // Reports may arrive while the parent installs its Tuya listeners. Establish
    // their baselines first so startup state is never interpreted as a press.
    this._lastOnoffState = null;
    this._lastBrightnessValue = null;
    this._hasStateBaseline = false;
    this._hasBrightnessBaseline = false;
    this._commandTracker = new TuyaCommandTracker();

    this.log('WallDimmer1Gang1Way initializing...');

    await super.onNodeInit({zclNode});

    this.printNode();

    // v5.5.799: Track settings to avoid unnecessary writes
    this._settingsApplied = false;

    // Register Tuya datapoint mappings
    this.log('Registering Tuya datapoint mappings...');
    
    this.registerTuyaDatapoint(dataPoints.state, 'onoff', {
      type: 'bool',
    });
    
    this.registerTuyaDatapoint(dataPoints.brightness, 'dim', {
      type: 'value',
      scale: 990,
      offset: -0.0101,
    });

    // Register capability listeners
    this.log('Registering capability listeners...');
    
    this.registerCapabilityListener('onoff', async (value) => {
      this.log('onoff capability changed to:', value, '(APP)');
      await this.sendTuyaCommand(dataPoints.state, value, 'bool');
    });
    
    this.registerCapabilityListener('dim', async (value) => {
      this.log('Dim capability changed to:', value, '(APP)');
      const brightness = Math.round(10 + (value * 990));
      this.log('Converted to Tuya brightness:', brightness);
      await this.sendTuyaCommand(dataPoints.brightness, brightness, 'value');
    });

    // v5.5.854: Parent class TuyaSpecificClusterDevice sets up Tuya listeners
    // We override handleTuyaResponse() and handleTuyaDataReport() for physical button detection
    
    // v5.5.799: Apply saved settings after init (with delay for device stability)
    setTimeout(() => this._applyInitialSettings(), 3000);

    this.log('WallDimmer1Gang1Way ready');
  }
  
  /**
   * v5.5.799: Handle settings changes from Homey UI
   * Implements min_brightness, power_on_behavior, light_type settings
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('⚙️ Settings changed:', changedKeys);
    
    for (const key of changedKeys) {
      try {
        switch (key) {
          case 'min_brightness':
            // Convert percentage (1-100) to Tuya range (10-1000)
            const minBrightness = Math.round(10 + ((newSettings.min_brightness / 100) * 990));
            this.log(`Setting min_brightness: ${newSettings.min_brightness}% → ${minBrightness}`);
            await this.sendTuyaCommand(dataPoints.minBrightness, minBrightness, 'value');
            break;
            
          case 'power_on_behavior':
            const powerOnValue = parseInt(newSettings.power_on_behavior, 10);
            this.log(`Setting power_on_behavior: ${powerOnValue}`);
            await this.sendTuyaCommand(dataPoints.powerOnBehavior, powerOnValue, 'enum');
            break;
            
          case 'light_type':
            const lightTypeValue = parseInt(newSettings.light_type, 10);
            this.log(`Setting light_type: ${lightTypeValue}`);
            await this.sendTuyaCommand(dataPoints.lightType, lightTypeValue, 'enum');
            break;

          case 'backlight_mode':
            const backlightValue = parseInt(newSettings.backlight_mode, 10);
            this.log(`Setting backlight_mode: ${backlightValue} (0=off, 1=normal, 2=inverted)`);

            // Try alternative datapoints DP36+DP37 (from issue #26578)
            if (backlightValue === 0) {
              // Always off: Set DP36=0 (backlight disabled)
              this.log('Trying DP36=0 (backlight off)');
              await this.sendTuyaCommand(dataPoints.backlightSwitch, false, 'bool').catch(err =>
                this.log('DP36 not supported:', err.message));
            } else {
              // Normal or inverted: Enable backlight (DP36=1) and set mode (DP37)
              this.log('Trying DP36=1 (backlight on)');
              await this.sendTuyaCommand(dataPoints.backlightSwitch, true, 'bool').catch(err =>
                this.log('DP36 not supported:', err.message));

              // DP37: 0=none, 1=relay/normal, 2=pos/inverted
              const lightMode = backlightValue; // 1=normal(relay), 2=inverted(pos)
              this.log(`Trying DP37=${lightMode} (light mode)`);
              await this.sendTuyaCommand(dataPoints.backlightLightMode, lightMode, 'enum').catch(err =>
                this.log('DP37 not supported:', err.message));
            }

            // Also try original DP15 as fallback
            await this.sendTuyaCommand(dataPoints.backlightMode, backlightValue, 'enum').catch(err =>
              this.log('DP15 failed (expected):', err.message));
            break;

          default:
            this.log(`Unknown setting: ${key}`);
        }
      } catch (err) {
        this.error(`Failed to apply setting ${key}:`, err);
        throw new Error(`Failed to apply ${key}: ${err.message}`);
      }
    }
  }
  
  /**
   * v5.5.799: Apply initial settings after device init
   */
  async _applyInitialSettings() {
    if (this._settingsApplied) return;
    this._settingsApplied = true;
    // Once per device, not on every app start: the dimmer keeps these settings itself,
    // and later changes go through onSettings(). Writing them on every start sent one
    // frame per dimmer (power_on_behavior "0" always passed the check) in the start burst.
    if (this.getStoreValue('initial_settings_applied')) return;
    await this.setStoreValue('initial_settings_applied', true).catch(() => {});

    try {
      const settings = this.getSettings();
      if (DEBUG_MODE) {
        this.log('📋 Applying initial settings:', settings);
      }
      
      // Apply min_brightness if set
      if (settings.min_brightness && settings.min_brightness > 1) {
        const minBrightness = Math.round(10 + ((settings.min_brightness / 100) * 990));
        await this.sendTuyaCommand(dataPoints.minBrightness, minBrightness, 'value').catch(e => {
          if (DEBUG_MODE) this.log('min_brightness not supported by this device');
        });
      }

      // Apply power_on_behavior if not default
      if (settings.power_on_behavior && settings.power_on_behavior !== '2') {
        const powerOnValue = parseInt(settings.power_on_behavior, 10);
        await this.sendTuyaCommand(dataPoints.powerOnBehavior, powerOnValue, 'enum').catch(e => {
          if (DEBUG_MODE) this.log('power_on_behavior not supported by this device');
        });
      }

      // Apply light_type if not default
      if (settings.light_type && settings.light_type !== '0') {
        const lightTypeValue = parseInt(settings.light_type, 10);
        await this.sendTuyaCommand(dataPoints.lightType, lightTypeValue, 'enum').catch(e => {
          if (DEBUG_MODE) this.log('light_type not supported by this device');
        });
      }

      // Apply backlight_mode if not default
      if (settings.backlight_mode && settings.backlight_mode !== '1') {
        const backlightValue = parseInt(settings.backlight_mode, 10);
        this.log(`Applying initial backlight_mode: ${backlightValue}`);

        // Try alternative datapoints DP36+DP37
        if (backlightValue === 0) {
          await this.sendTuyaCommand(dataPoints.backlightSwitch, false, 'bool').catch(() => {});
        } else {
          await this.sendTuyaCommand(dataPoints.backlightSwitch, true, 'bool').catch(() => {});
          await this.sendTuyaCommand(dataPoints.backlightLightMode, backlightValue, 'enum').catch(() => {});
        }
      }

    } catch (err) {
      this.error('Failed to apply initial settings:', err);
    }
  }

  /** Classify exact app echoes before duplicate filtering consumes their identity. */
  classifyTuyaFrame(data, context) {
    return this._commandTracker.classify(data, context.commandId);
  }

  _isRepeatedTuyaFrame(data, context = {}) {
    return this._commandTracker.isRepeated(data, context.commandId);
  }

  /** Preserve physical reports even when their value matches a recent app command. */
  handleTuyaResponse(data, context = {}) {
    const origin = context.origin || {};
    if (origin.stale || origin.duplicate) return;
    this.handleTuyaDataReport(data, !origin.matched);
  }

  /**
   * v5.5.854: Override parent's handleTuyaDataReport for consistent handling
   * This is called by parent for 'dataReport' events
   */
  handleTuyaDataReport(data, isReportingEvent = false) {
    // Route to our physical-button-aware handler
    this._processTuyaData(data, isReportingEvent);
  }

  /**
   * v5.5.854: Renamed from handleTuyaDataReport to avoid confusion with parent class
   * Handles both dataReport and response events with physical button detection
   */
  _processTuyaData(data, isReportingEvent = false) {
    if (DEBUG_MODE) {
      this.log('_processTuyaData:', JSON.stringify(data), 'reporting:', isReportingEvent);
    }
    
    if (!data || typeof data.dp === 'undefined') {
      if (DEBUG_MODE) this.log('Invalid data format');
      return;
    }

    const isPhysicalPress = isReportingEvent;

    // Handle state (onoff)
    if (data.dp === dataPoints.state) {
      let state;
      if (Buffer.isBuffer(data.data)) {
        if (data.data.length < 1) return;
        state = data.data.readUInt8(0) === 1;
      } else if (Array.isArray(data.data) && data.data.length >= 1) {
        state = data.data[0] === 1;
      } else if (typeof data.data === 'boolean' || (typeof data.data === 'number' && Number.isFinite(data.data))) {
        state = Boolean(data.data);
      } else {
        return;
      }
      const isStateBaseline = !this._hasStateBaseline;
      
      // Only process if state actually changed (heartbeat filter)
      if (this._lastOnoffState !== state) {
        const isPhysicalChange = isPhysicalPress && !isStateBaseline;
        if (DEBUG_MODE || isPhysicalChange) {
          this.log(`State changed: ${this._lastOnoffState} → ${state} (${isPhysicalChange ? 'PHYSICAL' : 'APP'})`);
        }

        if (isPhysicalPress) this._commandTracker?.noteDeviceChange(data.dp);
        this._lastOnoffState = state;
        this._hasStateBaseline = true;
        this.setCapabilityValue('onoff', state).catch(this.error);

        // Trigger flow cards ONLY if this is a physical button press
        if (isPhysicalChange) {
          const flowCardId = state ? 'wall_dimmer_1gang_1way_turned_on' : 'wall_dimmer_1gang_1way_turned_off';
          this.log(`Triggering: ${flowCardId}`);
          this.homey.flow.getDeviceTriggerCard(flowCardId)
            .trigger(this, {}, {})
            .catch(err => this.error(`Flow trigger failed: ${err.message}`));
        }
      }
    }

    // Handle brightness
    if (data.dp === dataPoints.brightness) {
      let brightnessRaw;
      if (Buffer.isBuffer(data.data)) {
        if (data.data.length < 4) return;
        brightnessRaw = data.data.readInt32BE(0);
      } else if (Array.isArray(data.data) && data.data.length >= 4) {
        brightnessRaw = Buffer.from(data.data).readInt32BE(0);
      } else if (typeof data.data === 'number' && Number.isFinite(data.data)) {
        brightnessRaw = data.data;
      } else {
        return;
      }
      const isBrightnessBaseline = !this._hasBrightnessBaseline;
      
      const brightness = Math.max(0, Math.min(1, (brightnessRaw - 10) / 990));
      
      // Only process if brightness changed significantly (~1%)
      const changeThreshold = 10;
      if (this._lastBrightnessValue === null || Math.abs(brightnessRaw - this._lastBrightnessValue) >= changeThreshold) {
        const isPhysicalChange = isPhysicalPress && !isBrightnessBaseline;
        if (DEBUG_MODE || isPhysicalChange) {
          this.log(`Brightness changed: ${this._lastBrightnessValue} → ${brightnessRaw} (${brightness.toFixed(2)}) (${isPhysicalChange ? 'PHYSICAL' : 'APP'})`);
        }

        const brightnessIncreased = !isBrightnessBaseline && this._lastBrightnessValue !== null && brightnessRaw > this._lastBrightnessValue;
        const brightnessDecreased = !isBrightnessBaseline && this._lastBrightnessValue !== null && brightnessRaw < this._lastBrightnessValue;

        if (isPhysicalPress) this._commandTracker?.noteDeviceChange(data.dp);
        this._lastBrightnessValue = brightnessRaw;
        this._hasBrightnessBaseline = true;
        this.setCapabilityValue('dim', brightness).catch(this.error);

        // Trigger flow cards ONLY if this is a physical button press
        if (isPhysicalChange) {
          if (brightnessIncreased) {
            this.log('Triggering: wall_dimmer_1gang_1way_brightness_increased (PHYSICAL)');
            this.homey.flow.getDeviceTriggerCard('wall_dimmer_1gang_1way_brightness_increased')
              .trigger(this, { brightness })
              .catch(this.error);
          } else if (brightnessDecreased) {
            this.log('Triggering: wall_dimmer_1gang_1way_brightness_decreased (PHYSICAL)');
            this.homey.flow.getDeviceTriggerCard('wall_dimmer_1gang_1way_brightness_decreased')
              .trigger(this, { brightness })
              .catch(this.error);
          }
        }
      }
    }
  }

  async sendTuyaCommand(dp, value, type = 'value') {
    try {
      const tuyaCluster = this.zclNode.endpoints[1]?.clusters?.tuya;

      if (!tuyaCluster) {
        throw new Error('Tuya cluster not available');
      }

      if (DEBUG_MODE) {
        this.log(`Sending Tuya command: DP ${dp} = ${value} (${type})`);
      }

      let dataBuffer;
      let datatype;

      switch (type) {
        case 'bool':
          dataBuffer = Buffer.alloc(1);
          dataBuffer.writeUInt8(value ? 1 : 0, 0);
          datatype = 1;
          break;

        case 'value':
          dataBuffer = Buffer.alloc(4);
          dataBuffer.writeInt32BE(value, 0);
          datatype = 2;
          break;

        case 'enum':
          dataBuffer = Buffer.alloc(1);
          dataBuffer.writeUInt8(Number(value), 0);
          datatype = 4;
          break;

        case 'string':
          dataBuffer = Buffer.from(String(value), 'utf8');
          datatype = 3;
          break;

        default:
          dataBuffer = Buffer.from([value]);
          datatype = 2;
      }

      const lengthBuffer = Buffer.alloc(2);
      lengthBuffer.writeUInt16BE(dataBuffer.length, 0);

      const transid = Math.floor(Math.random() * 256);
      this._commandTracker.record({ status: 0, transid, dp, datatype, data: dataBuffer });

      // Fire and forget: the dimmer confirms with a DP report, not with a ZCL response.
      // Waiting held a send slot for up to 10 s per command.
      await tuyaCluster.datapoint({
        status: 0,
        transid,
        dp,
        datatype,
        length: lengthBuffer,
        data: dataBuffer,
      }, { waitForResponse: false, disableDefaultResponse: true });

      if (DEBUG_MODE) {
        this.log('✅ Tuya command sent');
      }

    } catch (err) {
      this.error('Failed to send Tuya command:', err);
      throw err;
    }
  }

  onDeleted() {
    this.log('Switch Touch Dimmer (1 Gang) removed');
    super.onDeleted();
  }

}

module.exports = WallDimmer1Gang1Way;

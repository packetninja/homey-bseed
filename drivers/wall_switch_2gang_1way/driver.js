'use strict';

const BaseZigBeeDriver = require('../../lib/drivers/BaseZigBeeDriver');

/**
 * Wall Switch 2-Gang 1-Way Driver
 * Extends BaseZigBeeDriver to enable sub-device support (separate devices per gang)
 */
class WallSwitch2Gang1WayDriver extends BaseZigBeeDriver {

  async onInit() {
    this.log('Wall Switch 2-Gang 1-Way Driver initialized');
    this._registerFlowCards();
  }

  /**
   * Register flow cards for physical button triggers (both gangs)
   */
  _registerFlowCards() {
    this.log('Registering flow cards...');

    // Gang 1 triggers
    try {
      this.homey.flow.getDeviceTriggerCard('wall_switch_2gang_1way_gang1_turned_on');
      this.log('✅ Flow card registered: wall_switch_2gang_1way_gang1_turned_on');
    } catch (err) {
      this.error('Failed to register gang1_turned_on flow card:', err.message);
    }

    try {
      this.homey.flow.getDeviceTriggerCard('wall_switch_2gang_1way_gang1_turned_off');
      this.log('✅ Flow card registered: wall_switch_2gang_1way_gang1_turned_off');
    } catch (err) {
      this.error('Failed to register gang1_turned_off flow card:', err.message);
    }

    // Gang 2 triggers
    try {
      this.homey.flow.getDeviceTriggerCard('wall_switch_2gang_1way_gang2_turned_on');
      this.log('✅ Flow card registered: wall_switch_2gang_1way_gang2_turned_on');
    } catch (err) {
      this.error('Failed to register gang2_turned_on flow card:', err.message);
    }

    try {
      this.homey.flow.getDeviceTriggerCard('wall_switch_2gang_1way_gang2_turned_off');
      this.log('✅ Flow card registered: wall_switch_2gang_1way_gang2_turned_off');
    } catch (err) {
      this.error('Failed to register gang2_turned_off flow card:', err.message);
    }

    // ACTION: Turn on Gang 1
    try {
      this.homey.flow.getActionCard('wall_switch_2gang_1way_turn_on_gang1')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          this.log('Flow: Turning on Gang 1');
          await args.device.setCapabilityValue('onoff', true);
          return true;
        });
      this.log('✅ Flow card registered: wall_switch_2gang_1way_turn_on_gang1');
    } catch (err) {
      this.error('Failed to register turn_on_gang1 flow card:', err.message);
    }

    // ACTION: Turn off Gang 1
    try {
      this.homey.flow.getActionCard('wall_switch_2gang_1way_turn_off_gang1')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          this.log('Flow: Turning off Gang 1');
          await args.device.setCapabilityValue('onoff', false);
          return true;
        });
      this.log('✅ Flow card registered: wall_switch_2gang_1way_turn_off_gang1');
    } catch (err) {
      this.error('Failed to register turn_off_gang1 flow card:', err.message);
    }

    // ACTION: Turn on Gang 2
    try {
      this.homey.flow.getActionCard('wall_switch_2gang_1way_turn_on_gang2')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          this.log('Flow: Turning on Gang 2');
          await args.device.setCapabilityValue('onoff.gang2', true);
          return true;
        });
      this.log('✅ Flow card registered: wall_switch_2gang_1way_turn_on_gang2');
    } catch (err) {
      this.error('Failed to register turn_on_gang2 flow card:', err.message);
    }

    // ACTION: Turn off Gang 2
    try {
      this.homey.flow.getActionCard('wall_switch_2gang_1way_turn_off_gang2')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          this.log('Flow: Turning off Gang 2');
          await args.device.setCapabilityValue('onoff.gang2', false);
          return true;
        });
      this.log('✅ Flow card registered: wall_switch_2gang_1way_turn_off_gang2');
    } catch (err) {
      this.error('Failed to register turn_off_gang2 flow card:', err.message);
    }

    // ACTION: Set backlight mode
    try {
      this.homey.flow.getActionCard('wall_switch_2gang_1way_set_backlight')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          this.log(`Flow: Setting backlight mode to ${args.mode}`);

          // Use HybridSwitchBase's setBacklightMode method
          await args.device.setBacklightMode(args.mode);

          // Update the setting in Homey
          await args.device.setSettings({ backlight_mode: args.mode }).catch(() => {});

          return true;
        });
      this.log('✅ Flow card registered: wall_switch_2gang_1way_set_backlight');
    } catch (err) {
      this.log(`⚠️ Flow card registration failed: ${err.message}`);
    }

    this.log('Flow cards registration complete');
  }

}

module.exports = WallSwitch2Gang1WayDriver;

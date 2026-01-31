'use strict';

const BaseZigBeeDriver = require('../../lib/drivers/BaseZigBeeDriver');

/**
 * Wall Switch 3-Gang 1-Way Driver
 * Sub-device support is configured via driver.compose.json "devices" section.
 * Framework automatically creates separate device cards for each gang.
 */
class WallSwitch3Gang1WayDriver extends BaseZigBeeDriver {

  async onInit() {
    this.log('Wall Switch 3-Gang 1-Way Driver initialized');
    this._registerFlowCards();
  }

  /**
   * Register flow cards for physical button triggers (all gangs)
   */
  _registerFlowCards() {
    // Gang 1-3 triggers
    try {
      this.homey.flow.getDeviceTriggerCard('wall_switch_3gang_1way_gang1_turned_on');
      this.homey.flow.getDeviceTriggerCard('wall_switch_3gang_1way_gang1_turned_off');
      this.homey.flow.getDeviceTriggerCard('wall_switch_3gang_1way_gang2_turned_on');
      this.homey.flow.getDeviceTriggerCard('wall_switch_3gang_1way_gang2_turned_off');
      this.homey.flow.getDeviceTriggerCard('wall_switch_3gang_1way_gang3_turned_on');
      this.homey.flow.getDeviceTriggerCard('wall_switch_3gang_1way_gang3_turned_off');
    } catch (err) {
      this.error('Failed to register trigger cards:', err.message);
    }

    // ACTION: Turn on Gang 1
    try {
      this.homey.flow.getActionCard('wall_switch_3gang_1way_turn_on_gang1')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          await args.device.setCapabilityValue('onoff', true);
          return true;
        });
    } catch (err) {
      this.error('Failed to register turn_on_gang1 flow card:', err.message);
    }

    // ACTION: Turn off Gang 1
    try {
      this.homey.flow.getActionCard('wall_switch_3gang_1way_turn_off_gang1')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          await args.device.setCapabilityValue('onoff', false);
          return true;
        });
    } catch (err) {
      this.error('Failed to register turn_off_gang1 flow card:', err.message);
    }

    // ACTION: Turn on Gang 2
    try {
      this.homey.flow.getActionCard('wall_switch_3gang_1way_turn_on_gang2')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          await args.device.setCapabilityValue('onoff.gang2', true);
          return true;
        });
    } catch (err) {
      this.error('Failed to register turn_on_gang2 flow card:', err.message);
    }

    // ACTION: Turn off Gang 2
    try {
      this.homey.flow.getActionCard('wall_switch_3gang_1way_turn_off_gang2')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          await args.device.setCapabilityValue('onoff.gang2', false);
          return true;
        });
    } catch (err) {
      this.error('Failed to register turn_off_gang2 flow card:', err.message);
    }

    // ACTION: Turn on Gang 3
    try {
      this.homey.flow.getActionCard('wall_switch_3gang_1way_turn_on_gang3')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          await args.device.setCapabilityValue('onoff.gang3', true);
          return true;
        });
    } catch (err) {
      this.error('Failed to register turn_on_gang3 flow card:', err.message);
    }

    // ACTION: Turn off Gang 3
    try {
      this.homey.flow.getActionCard('wall_switch_3gang_1way_turn_off_gang3')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          await args.device.setCapabilityValue('onoff.gang3', false);
          return true;
        });
    } catch (err) {
      this.error('Failed to register turn_off_gang3 flow card:', err.message);
    }

    // ACTION: Set backlight mode
    try {
      this.homey.flow.getActionCard('wall_switch_3gang_1way_set_backlight')
        .registerRunListener(async (args) => {
          if (!args.device) return false;
          await args.device.setBacklightMode(args.mode);
          await args.device.setSettings({ backlight_mode: args.mode }).catch(() => {});
          return true;
        });
    } catch (err) {
      this.error('Flow card registration failed:', err.message);
    }
  }

}

module.exports = WallSwitch3Gang1WayDriver;

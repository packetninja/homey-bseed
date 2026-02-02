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
   * Register flow cards for physical button triggers and backlight control
   */
  _registerFlowCards() {
    // Physical button triggers
    try {
      this.homey.flow.getDeviceTriggerCard('wall_switch_3gang_1way_turned_on_physical');
      this.homey.flow.getDeviceTriggerCard('wall_switch_3gang_1way_turned_off_physical');
    } catch (err) {
      this.error('Failed to register trigger cards:', err.message);
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

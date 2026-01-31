'use strict';

const Homey = require('homey');
const { registerCustomClusters } = require('./lib/zigbee/registerClusters');

class BSEEDApp extends Homey.App {

  async onInit() {
    this.log('BSEED App is running...');

    // Register custom ZigBee clusters (especially Tuya cluster 0xEF00)
    registerCustomClusters(this);
    this.log('Custom ZigBee clusters registered');
  }

}

module.exports = BSEEDApp;

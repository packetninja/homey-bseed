'use strict';

const Homey = require('homey');

class BSEEDApp extends Homey.App {

  async onInit() {
    this.log('BSEED App is running...');
  }

}

module.exports = BSEEDApp;

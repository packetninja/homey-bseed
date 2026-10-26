'use strict';

/**
 * Spreads device initialisation over time.
 *
 * On app start Homey initialises every device at once, and each device sends its own
 * init frames (configureReporting, readAttributes, Tuya writes). With ~35 mains-powered
 * switches that is a burst the coordinator has to queue all at once. Each call waits for
 * its own slot, GAP_MS after the previous one.
 */

const GAP_MS = 300;

let nextSlot = 0;

/**
 * Wait until this device may start its init.
 * @returns {Promise<void>}
 */
async function waitForInitSlot() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + GAP_MS;
  if (slot > now) {
    await new Promise(resolve => setTimeout(resolve, slot - now));
  }
}

module.exports = { waitForInitSlot, GAP_MS };

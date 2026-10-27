'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const pendingRepliesPath = path.join(projectRoot, 'lib/utils/TuyaPendingReplies');
const REPORT = Buffer.from('09a502006e0101000100', 'hex');

function loadPendingRepliesWithFakeTimers() {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const timers = [];
  const cleared = [];
  global.setInterval = (callback, delay) => {
    const timer = { callback, delay, unref() {} };
    timers.push(timer);
    return timer;
  };
  global.clearInterval = timer => cleared.push(timer);
  delete require.cache[require.resolve(pendingRepliesPath)];
  const pendingReplies = require(pendingRepliesPath);
  return {
    ...pendingReplies,
    cleared,
    restore() {
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
      delete require.cache[require.resolve(pendingRepliesPath)];
    },
    timers,
  };
}

function replyFor(frame) {
  return Buffer.from([0x10, frame[1], 0x0B, frame[2], 0x00]);
}

function deviceWithNode({ handleFrame, log = () => {}, sendFrame }) {
  const node = {
    handleFrame,
    sendFrame,
  };
  return { device: { log, node }, node };
}

test('detach is idempotent, restores identities, and leaves a buried wrapper transparent', () => {
  const pendingReplies = loadPendingRepliesWithFakeTimers();
  try {
    const calls = [];
    const originalHandleFrame = function originalHandleFrame(...args) {
      calls.push(['handle', this, args]);
      return 'handled';
    };
    const originalSendFrame = function originalSendFrame(...args) {
      calls.push(['send', this, args]);
      return 'sent';
    };
    const { device, node } = deviceWithNode({
      handleFrame: originalHandleFrame,
      sendFrame: originalSendFrame,
    });
    const attachment = pendingReplies.attach(device);
    attachment.detach();
    attachment.detach();
    assert.equal(node.handleFrame, originalHandleFrame);
    assert.equal(node.sendFrame, originalSendFrame);
    assert.equal(pendingReplies.snapshot(node), null);

    const reattached = pendingReplies.attach(device);
    const buriedHandleFrame = node.handleFrame;
    const buriedSendFrame = node.sendFrame;
    const laterHandleFrame = (...args) => buriedHandleFrame(...args);
    const laterSendFrame = (...args) => buriedSendFrame(...args);
    node.handleFrame = laterHandleFrame;
    node.sendFrame = laterSendFrame;
    reattached.detach();

    assert.equal(node.handleFrame, laterHandleFrame);
    assert.equal(node.sendFrame, laterSendFrame);
    assert.equal(node.handleFrame(1, 2, Buffer.alloc(0)), 'handled');
    assert.equal(node.sendFrame(1, 2, Buffer.alloc(0)), 'sent');
    assert.equal(calls[0][1], node);
    assert.equal(calls[1][1], node);
  } finally {
    pendingReplies.restore();
  }
});

test('detaching retains an in-flight reply until it settles and permits reattachment', async () => {
  const pendingReplies = loadPendingRepliesWithFakeTimers();
  try {
    let resolveSend;
    const { device, node } = deviceWithNode({
      handleFrame(endpointId, clusterId, frame) {
        return this.sendFrame(endpointId, clusterId, replyFor(frame));
      },
      sendFrame: () => new Promise(resolve => { resolveSend = resolve; }),
    });
    const attachment = pendingReplies.attach(device);
    const processing = node.handleFrame(1, 0xEF00, REPORT, {});
    attachment.detach();

    assert.equal(pendingReplies.snapshot(node), null);
    assert.equal(attachment.snapshot().pending, 1);
    resolveSend();
    await processing;
    assert.equal(attachment.snapshot().pending, 0);
    assert.equal(attachment.snapshot().globalActualPending, 0);

    const reattached = pendingReplies.attach(device);
    assert.notEqual(reattached, attachment);
    reattached.detach();
  } finally {
    pendingReplies.restore();
  }
});

test('one aggregate timer summarizes 25 devices, sums overflow, and stops after the last detach', async () => {
  const pendingReplies = loadPendingRepliesWithFakeTimers();
  try {
    const logs = [];
    const releases = [];
    const apis = [];
    let firstNode;
    for (let index = 0; index < 25; index += 1) {
      const { device, node } = deviceWithNode({
        handleFrame(endpointId, clusterId, frame) {
          return this.sendFrame(endpointId, clusterId, replyFor(frame));
        },
        log: (...args) => logs.push(args),
        sendFrame: () => new Promise(resolve => releases.push(resolve)),
      });
      if (index === 0) firstNode = node;
      apis.push(pendingReplies.attach(device));
    }
    assert.equal(pendingReplies.timers.length, 1);
    assert.equal(pendingReplies.timers[0].delay, 30_000);

    const frames = Array.from({ length: 65 }, (_, index) => {
      const frame = Buffer.from(REPORT);
      frame[1] = index;
      return frame;
    });
    const processing = frames.map(frame => firstNode.handleFrame(1, 0xEF00, frame, {}));
    pendingReplies.timers[0].callback();

    const aggregate = logs.find(args => args[0] === '[ACK-COALESCE][GLOBAL]');
    assert.ok(aggregate);
    const summary = JSON.parse(aggregate[1]);
    assert.equal(summary.deviceCount, 25);
    assert.equal(summary.overflow, 1);
    assert.equal(summary.trackedAttempts, 64);
    assert.equal(summary.actualPending, 64);

    releases.forEach(resolve => resolve());
    await Promise.all(processing);
    apis.forEach(api => api.detach());
    assert.equal(pendingReplies.cleared.length, 1);
  } finally {
    pendingReplies.restore();
  }
});

test('base and dimmer deletion clean up once and always call their parent lifecycle', () => {
  const baseSource = fs.readFileSync(path.join(projectRoot, 'lib/tuya/TuyaSpecificClusterDevice.js'), 'utf8');
  let baseDeleted = 0;
  const baseModule = { exports: {} };
  class ZigBeeDevice {
    onDeleted() {
      baseDeleted += 1;
    }
  }
  vm.runInNewContext(baseSource, {
    Buffer,
    Map,
    Math,
    Object,
    Promise,
    Set,
    clearInterval,
    clearTimeout,
    module: baseModule,
    require: name => {
      if (name === 'homey-zigbeedriver') return { ZigBeeDevice };
      if (name === 'zigbee-clusters') return { CLUSTER: {} };
      if (name === '../mixins/PeriodicAutoEnricherMixin') return {};
      if (name === '../utils/InitPacer') return { waitForInitSlot: async () => {} };
      if (name === '../utils/TuyaPendingReplies') return { attach: () => ({}) };
      if (name === '../utils/PhysicalPressTrace') return { attach: () => ({}) };
      throw new Error(`Unexpected import: ${name}`);
    },
    setInterval,
    setTimeout,
  }, { filename: 'TuyaSpecificClusterDevice.js' });
  const base = Object.create(baseModule.exports.prototype);
  let detached = 0;
  let cleaned = 0;
  base._tuyaPendingReplies = { detach: () => { detached += 1; } };
  base.cleanupPeriodicEnricher = () => { cleaned += 1; };
  base.onDeleted();
  assert.deepEqual([detached, cleaned, baseDeleted], [1, 1, 1]);

  const dimmerSource = fs.readFileSync(path.join(projectRoot, 'drivers/wall_dimmer_1gang_1way/device.js'), 'utf8');
  let dimmerBaseDeleted = 0;
  const dimmerModule = { exports: {} };
  class DimmerBase {
    onDeleted() {
      dimmerBaseDeleted += 1;
    }
  }
  let clearedTimeout = null;
  vm.runInNewContext(dimmerSource, {
    Buffer,
    Date,
    Math,
    Number,
    clearTimeout: timeout => { clearedTimeout = timeout; },
    module: dimmerModule,
    require: name => {
      if (name === '../../lib/tuya/TuyaSpecificClusterDevice') return DimmerBase;
      if (name === 'zigbee-clusters') return {};
      if (name === '../../lib/utils/TuyaCommandTracker') return require('../lib/utils/TuyaCommandTracker');
      throw new Error(`Unexpected import: ${name}`);
    },
    setTimeout,
  }, { filename: 'wall-dimmer-device.js' });
  const dimmer = Object.create(dimmerModule.exports.prototype);
  dimmer._appCommandTimeout = 'timer';
  dimmer.log = () => {};
  dimmer.onDeleted();
  assert.equal(clearedTimeout, null); // The obsolete app-command timer no longer exists.
  assert.equal(dimmerBaseDeleted, 1);
});

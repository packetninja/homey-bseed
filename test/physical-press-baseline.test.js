'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'drivers/wall_dimmer_1gang_1way/device.js'), 'utf8');

function loadDriver(parentOnNodeInit = async () => {}, ParentOverride = null) {
  class TuyaSpecificClusterDevice {
    async onNodeInit(args) {
      return parentOnNodeInit.call(this, args);
    }
  }
  const mod = { exports: {} };
  vm.runInNewContext(source, {
    Buffer,
    Date,
    Math,
    Number,
    clearTimeout,
    module: mod,
    require: name => {
      if (name === '../../lib/tuya/TuyaSpecificClusterDevice') return ParentOverride || TuyaSpecificClusterDevice;
      if (name === 'zigbee-clusters') return {};
      if (name === '../../lib/utils/TuyaCommandTracker') return require('../lib/utils/TuyaCommandTracker');
      throw new Error(`Unexpected import: ${name}`);
    },
    setTimeout: () => 1,
  }, { filename: 'wall-dimmer-device.js' });
  return mod.exports;
}

function loadBase() {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(projectRoot, 'lib/tuya/TuyaSpecificClusterDevice.js'), 'utf8'), {
    Buffer, module: mod, require: name => {
      if (name === 'homey-zigbeedriver') return { ZigBeeDevice: class {} };
      if (name === 'zigbee-clusters') return { CLUSTER: {} };
      if (name === '../mixins/PeriodicAutoEnricherMixin') return {};
      if (name === '../utils/InitPacer') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return mod.exports;
}

function fixture(Driver) {
  const device = Object.create(Driver.prototype);
  const events = [];
  const logs = [];
  const updates = [];
  device.log = (...args) => logs.push(args.join(' '));
  device.error = () => {};
  device.setCapabilityValue = (capability, value) => {
    updates.push([capability, value]);
    return Promise.resolve();
  };
  device.homey = { flow: { getDeviceTriggerCard: id => ({ trigger: () => {
    events.push(id);
    return Promise.resolve();
  } }) } };
  device.getStoreValue = () => true;
  device.printNode = () => {};
  device.registerCapabilityListener = () => {};
  device.registerTuyaDatapoint = () => {};
  return { device, events, logs, updates };
}

function stateReport(value) {
  return { dp: 1, data: Buffer.from([value]) };
}

function brightnessReport(value) {
  const data = Buffer.alloc(4);
  data.writeInt32BE(value, 0);
  return { dp: 2, data };
}

function uninitialized(device) {
  device._lastOnoffState = null;
  device._lastBrightnessValue = null;
  device._hasStateBaseline = false;
  device._hasBrightnessBaseline = false;
  device._appCommandPending = false;
  device._commandTracker = new (require('../lib/utils/TuyaCommandTracker').TuyaCommandTracker)();
}

function receive(device, data, commandId) {
  const context = { commandId };
  context.origin = device.classifyTuyaFrame(data, context);
  if (context.origin.duplicate) return;
  if (device._isRepeatedTuyaFrame(data, context) && !context.origin.matched) return;
  device.handleTuyaResponse(data, context);
}

function packet(seq, value) {
  return { ...stateReport(value), status: seq >> 8, transid: seq & 255, datatype: 1 };
}

test('actual cluster listeners preserve command domains and dispatch physical transitions', () => {
  const { EventEmitter } = require('node:events');
  const Base = loadBase();
  const { device, events } = fixture(loadDriver(undefined, Base));
  uninitialized(device);
  const cluster = new EventEmitter();
  device.zclNode = { endpoints: { 1: { clusters: { tuya: cluster } } } };
  device.setupTuyaCluster();
  cluster.emit('response', packet(622, 0));
  const app = packet(640, 1); device._commandTracker.record(app);
  cluster.emit('reporting', app);
  cluster.emit('response', packet(623, 0));
  cluster.emit('response', packet(624, 1));
  cluster.emit('response', packet(625, 0));
  cluster.emit('reporting', app);
  assert.equal(device._lastOnoffState, false);
  assert.deepEqual(events, ['wall_dimmer_1gang_1way_turned_off',
    'wall_dimmer_1gang_1way_turned_on', 'wall_dimmer_1gang_1way_turned_off']);
});

test('captured presence ON then physical OFF/ON/OFF produces all three physical triggers', () => {
  const { device, events } = fixture(loadDriver());
  uninitialized(device);
  receive(device, packet(622, 0), 2);
  const command = packet(83, 1);
  device._commandTracker.record(command);
  receive(device, command, 1);
  receive(device, packet(623, 0), 2);
  receive(device, packet(624, 1), 2);
  receive(device, packet(625, 0), 2);
  assert.deepEqual(events, ['wall_dimmer_1gang_1way_turned_off',
    'wall_dimmer_1gang_1way_turned_on', 'wall_dimmer_1gang_1way_turned_off']);
});

test('out-of-order echoes and retransmits cannot trigger flows or revert the latest state', () => {
  const { device, events } = fixture(loadDriver());
  uninitialized(device);
  receive(device, packet(600, 0), 2);
  const on = packet(192, 1), off = packet(59, 0);
  device._commandTracker.record(on); device._commandTracker.record(off);
  receive(device, off, 1); receive(device, on, 1); receive(device, on, 1);
  assert.equal(device._lastOnoffState, false);
  assert.deepEqual(events, []);
  // An identical newly sent command must still apply despite the duplicate cache.
  device._commandTracker.record(on); receive(device, on, 1);
  assert.equal(device._lastOnoffState, true);
  assert.deepEqual(events, []);
});

test('a send rejection retains exact echo identity because delivery may have occurred', async () => {
  const { device, events } = fixture(loadDriver());
  uninitialized(device);
  receive(device, packet(600, 0), 2);
  let sent;
  device.zclNode = { endpoints: { 1: { clusters: { tuya: { datapoint: async data => {
    sent = data; throw new Error('delivery uncertain');
  } } } } } };
  await assert.rejects(device.sendTuyaCommand(1, true, 'bool'), /delivery uncertain/);
  receive(device, sent, 1);
  assert.equal(device._lastOnoffState, true);
  assert.deepEqual(events, []);
});

test('reports delivered during super.onNodeInit establish startup baselines without flows', async () => {
  const Driver = loadDriver(async function receiveStartupReports() {
    this.handleTuyaResponse(stateReport(0));
    this.handleTuyaResponse(brightnessReport(250));
  });
  const { device, events, updates } = fixture(Driver);

  await device.onNodeInit({ zclNode: {} });

  assert.equal(device._hasStateBaseline, true);
  assert.equal(device._hasBrightnessBaseline, true);
  assert.equal(device._lastOnoffState, false);
  assert.equal(device._lastBrightnessValue, 250);
  assert.deepEqual(events, []);
  assert.deepEqual(updates, [['onoff', false], ['dim', (250 - 10) / 990]]);
});

test('first valid state and brightness reports update capabilities without physical logs or flows', () => {
  const { device, events, logs, updates } = fixture(loadDriver());
  uninitialized(device);

  device.handleTuyaResponse(stateReport(1));
  device.handleTuyaResponse(brightnessReport(400));

  assert.equal(device._hasStateBaseline, true);
  assert.equal(device._hasBrightnessBaseline, true);
  assert.deepEqual(events, []);
  assert.equal(logs.some(line => line.includes('PHYSICAL')), false);
  assert.deepEqual(updates, [['onoff', true], ['dim', (400 - 10) / 990]]);
});

test('subsequent state and dim transitions retain physical triggers', () => {
  const { device, events } = fixture(loadDriver());
  uninitialized(device);

  device.handleTuyaResponse(stateReport(0));
  device.handleTuyaResponse(brightnessReport(200));
  device.handleTuyaResponse(stateReport(1));
  device.handleTuyaResponse(brightnessReport(500));

  assert.deepEqual(events, [
    'wall_dimmer_1gang_1way_turned_on',
    'wall_dimmer_1gang_1way_brightness_increased',
  ]);
});

test('same-state heartbeats do not trigger and malformed reports do not establish a baseline', () => {
  const { device, events, updates } = fixture(loadDriver());
  uninitialized(device);

  device.handleTuyaResponse({ dp: 1, data: Buffer.alloc(0) });
  device.handleTuyaResponse({ dp: 2, data: Buffer.alloc(3) });
  device.handleTuyaResponse({ dp: 1, data: Number.NaN });
  assert.equal(device._hasStateBaseline, false);
  assert.equal(device._hasBrightnessBaseline, false);
  assert.deepEqual(updates, []);

  device.handleTuyaResponse(stateReport(0));
  device.handleTuyaResponse(brightnessReport(300));
  device.handleTuyaResponse(stateReport(0));
  device.handleTuyaResponse(brightnessReport(300));

  assert.deepEqual(events, []);
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const { Cluster, ZCLNode } = require(path.join(projectRoot, 'node_modules/zigbee-clusters'));
const TuyaSpecificCluster = require(path.join(projectRoot, 'lib/clusters/TuyaSpecificCluster'));
const { attach, snapshot } = require(path.join(projectRoot, 'lib/utils/TuyaPendingReplies'));

try {
  Cluster.addCluster(TuyaSpecificCluster);
} catch (error) {
  if (!/already exists/i.test(error.message)) throw error;
}

const REPORT = Buffer.from('09a502006e0101000100', 'hex');
const REPORT_CHANGED_PAYLOAD = Buffer.from('09a502006e0101000101', 'hex');
const ACK = Buffer.from('10a50b0200', 'hex');

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

function makeZclHarness(sendFrame) {
  const node = {
    endpointDescriptors: [{ endpointId: 1, inputClusters: [0xEF00] }],
    sendFrame,
  };
  const zclNode = new ZCLNode(node);
  const device = {
    node,
    log() {},
  };
  const coalescer = attach(device);
  return { coalescer, device, node, zclNode };
}

function makeRawHarness(sendFrame, handler) {
  const node = {
    async handleFrame(endpointId, clusterId, frame, meta) {
      return handler(node, endpointId, clusterId, frame, meta);
    },
    sendFrame,
  };
  const device = { node, log() {} };
  return { coalescer: attach(device), device, node };
}

test('coalesces concurrent identical Tuya reports while every callback still runs', async () => {
  const release = [];
  const sends = [];
  const { coalescer, node, zclNode } = makeZclHarness((...args) => new Promise(resolve => {
    sends.push(args);
    release.push(resolve);
  }));
  let callbacks = 0;
  zclNode.endpoints[1].clusters.tuya.on('response', () => { callbacks += 1; });

  const pending = Array.from({ length: 25 }, () => node.handleFrame(1, 0xEF00, REPORT, {}));
  await nextTurn();

  assert.equal(callbacks, 25);
  assert.equal(sends.length, 1);
  assert.deepEqual([sends[0][0], sends[0][1], sends[0][2].toString('hex')], [1, 0xEF00, '10a50b0200']);
  assert.deepEqual(coalescer.snapshot(), {
    attempts: 1,
    coalesced: 24,
    success: 0,
    fail: 0,
    retries: 0,
    overflow: 0,
    pending: 1,
    peak: 1,
    globalActualPending: 1,
    globalPeak: 1,
    latencyMs: { count: 0, min: null, max: null, avg: null },
  });

  release[0]();
  await Promise.all(pending);
  assert.equal(snapshot(node).pending, 0);
  assert.equal(snapshot(node).success, 1);
});

test('does not coalesce distinct payloads sharing a transaction sequence number', async () => {
  const sends = [];
  const { node, zclNode } = makeZclHarness(async (...args) => { sends.push(args); });
  let callbacks = 0;
  zclNode.endpoints[1].clusters.tuya.on('response', () => { callbacks += 1; });

  await Promise.all([
    node.handleFrame(1, 0xEF00, REPORT, {}),
    node.handleFrame(1, 0xEF00, REPORT_CHANGED_PAYLOAD, {}),
  ]);

  assert.equal(callbacks, 2);
  assert.equal(sends.length, 2);
  assert.deepEqual(sends.map(args => args[2].toString('hex')), ['10a50b0200', '10a50b0200']);
});

test('clears settled replies so a later duplicate sends again', async () => {
  let sends = 0;
  const { coalescer, node } = makeZclHarness(async () => { sends += 1; });

  await node.handleFrame(1, 0xEF00, REPORT, {});
  await nextTurn();
  await node.handleFrame(1, 0xEF00, REPORT, {});

  assert.equal(sends, 2);
  assert.equal(coalescer.snapshot().pending, 0);
  assert.equal(coalescer.snapshot().success, 2);
});

test('allows one trailing retry after a failed send when duplicates were pending', async () => {
  let sends = 0;
  let rejectFirst;
  const { coalescer, node } = makeZclHarness(() => {
    sends += 1;
    if (sends === 1) return new Promise((resolve, reject) => { rejectFirst = reject; });
    return Promise.resolve();
  });

  const first = node.handleFrame(1, 0xEF00, REPORT, {});
  await nextTurn();
  const duplicate = node.handleFrame(1, 0xEF00, REPORT, {});
  await nextTurn();
  rejectFirst(new Error('first attempt failed'));
  await Promise.all([first, duplicate]);

  assert.equal(sends, 2);
  assert.equal(coalescer.snapshot().attempts, 2);
  assert.equal(coalescer.snapshot().fail, 1);
  assert.equal(coalescer.snapshot().success, 1);
  assert.equal(coalescer.snapshot().retries, 1);
  assert.equal(coalescer.snapshot().pending, 0);
});

test('passes non-Tuya, ordinary, default-error, concurrent DDR, and broadcast sends unchanged', async () => {
  const sends = [];
  const { coalescer, node } = makeRawHarness(
    async (...args) => { sends.push(args); },
    async (rawNode, endpointId, clusterId, frame, meta) => rawNode.sendFrame(
      endpointId,
      clusterId,
      meta.reply,
      meta.extra,
    ),
  );
  const cases = [
    {
      clusterId: 0xEF00,
      frame: Buffer.from('09a50300', 'hex'),
      meta: { reply: Buffer.from('10a50b0300', 'hex'), extra: 'ordinary-command' },
    },
    {
      clusterId: 0xEF00,
      frame: REPORT,
      meta: { reply: Buffer.from('10a50b0281', 'hex'), extra: 'default-error' },
    },
    {
      clusterId: 0xEF00,
      frame: Buffer.from('19a502006e0101000100', 'hex'),
      meta: { reply: ACK, extra: 'default-response-disabled' },
    },
    {
      clusterId: 0xEF00,
      frame: Buffer.from('19a502006e0101000100', 'hex'),
      meta: { reply: ACK, extra: 'default-response-disabled' },
    },
    {
      clusterId: 0xEF00,
      frame: REPORT,
      meta: { isBroadcast: true, reply: ACK, extra: 'broadcast' },
    },
    {
      clusterId: 0xEF00,
      frame: REPORT,
      meta: { isBroadcast: true, reply: ACK, extra: 'broadcast' },
    },
    {
      clusterId: 0x0006,
      frame: REPORT,
      meta: { reply: ACK, extra: 'other-cluster' },
    },
  ];

  await Promise.all(cases.map(({ clusterId, frame, meta }) => node.handleFrame(1, clusterId, frame, meta)));

  assert.equal(sends.length, cases.length);
  assert.equal(coalescer.snapshot().coalesced, 0);
  assert.deepEqual(sends.map(args => [args[1], args[2].toString('hex'), args[3]]), [
    [0xEF00, '10a50b0300', 'ordinary-command'],
    [0xEF00, '10a50b0281', 'default-error'],
    [0xEF00, '10a50b0200', 'default-response-disabled'],
    [0xEF00, '10a50b0200', 'default-response-disabled'],
    [0xEF00, '10a50b0200', 'broadcast'],
    [0xEF00, '10a50b0200', 'broadcast'],
    [0x0006, '10a50b0200', 'other-cluster'],
  ]);
});

test('keeps each concurrent incoming frame context through asynchronous handling', async () => {
  const sends = [];
  const { node } = makeRawHarness(
    async (...args) => { sends.push(args); },
    async (rawNode, endpointId, clusterId, frame) => {
      await new Promise(resolve => setTimeout(resolve, frame[frame.length - 1] === 0 ? 10 : 1));
      return rawNode.sendFrame(endpointId, clusterId, Buffer.from([
        0x10, frame[1], 0x0B, frame[2], 0x00,
      ]));
    },
  );

  await Promise.all([
    node.handleFrame(1, 0xEF00, REPORT, {}),
    node.handleFrame(1, 0xEF00, REPORT_CHANGED_PAYLOAD, {}),
  ]);

  assert.equal(sends.length, 2);
  assert.deepEqual(sends.map(args => args[2].toString('hex')).sort(), ['10a50b0200', '10a50b0200']);
});

test('does not make a third attempt after a trailing retry fails, then permits a later retry', async () => {
  const settlements = [];
  let sends = 0;
  const { coalescer, node } = makeZclHarness(() => new Promise((resolve, reject) => {
    sends += 1;
    settlements.push({ resolve, reject });
  }));

  const first = node.handleFrame(1, 0xEF00, REPORT, {});
  await nextTurn();
  const duplicates = Array.from({ length: 4 }, () => node.handleFrame(1, 0xEF00, REPORT, {}));
  await nextTurn();
  settlements[0].reject(new Error('first failure'));
  await nextTurn();
  assert.equal(sends, 2);

  const duringRetry = node.handleFrame(1, 0xEF00, REPORT, {});
  await nextTurn();
  assert.equal(sends, 2);
  settlements[1].reject(new Error('trailing failure'));
  await Promise.all([first, ...duplicates, duringRetry]);
  await nextTurn();

  assert.equal(sends, 2);
  assert.equal(coalescer.snapshot().fail, 2);
  assert.equal(coalescer.snapshot().retries, 1);
  assert.equal(coalescer.snapshot().pending, 0);

  const later = node.handleFrame(1, 0xEF00, REPORT, {});
  await nextTurn();
  assert.equal(sends, 3);
  settlements[2].resolve();
  await later;
});

test('keeps 64 distinct pending replies, passes the 65th through, and still coalesces an existing key', async () => {
  const settlements = [];
  const sends = [];
  const { coalescer, node } = makeRawHarness(
    (...args) => new Promise(resolve => {
      sends.push(args);
      settlements.push(resolve);
    }),
    (rawNode, endpointId, clusterId, frame) => rawNode.sendFrame(endpointId, clusterId, Buffer.from([
      0x10, frame[1], 0x0B, frame[2], 0x00,
    ])),
  );
  const frames = Array.from({ length: 65 }, (_, index) => {
    const frame = Buffer.from(REPORT);
    frame[1] = index;
    return frame;
  });

  const tracked = frames.slice(0, 64).map(frame => node.handleFrame(1, 0xEF00, frame, {}));
  await nextTurn();
  const overflow = node.handleFrame(1, 0xEF00, frames[64], {});
  const duplicate = node.handleFrame(1, 0xEF00, frames[0], {});
  await nextTurn();

  assert.equal(sends.length, 65);
  assert.equal(coalescer.snapshot().pending, 64);
  assert.equal(coalescer.snapshot().overflow, 1);
  assert.equal(coalescer.snapshot().coalesced, 1);
  assert.deepEqual(sends[64].slice(0, 3).map(value => Buffer.isBuffer(value) ? value.toString('hex') : value), [
    1,
    0xEF00,
    '10400b0200',
  ]);

  settlements.forEach(resolve => resolve());
  await Promise.all([...tracked, overflow, duplicate]);
  assert.equal(coalescer.snapshot().pending, 0);
});

test('passes an app-originated frame outside receive processing unchanged', async () => {
  const sends = [];
  const { coalescer, node } = makeRawHarness(async (...args) => { sends.push(args); }, async () => {});

  await node.sendFrame(1, 0xEF00, ACK, 'application-originated');

  assert.deepEqual(sends.map(args => [args[0], args[1], args[2].toString('hex'), args[3]]), [
    [1, 0xEF00, '10a50b0200', 'application-originated'],
  ]);
  assert.equal(coalescer.snapshot().attempts, 0);
  assert.equal(coalescer.snapshot().coalesced, 0);
});

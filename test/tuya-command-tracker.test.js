'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TuyaCommandTracker, TTL_MS, MAX_COMMANDS } = require('../lib/utils/TuyaCommandTracker');
const report = (seq, value, dp = 1) => ({ status: seq >> 8, transid: seq & 255,
  dp, datatype: dp === 1 ? 1 : 2, data: dp === 1 ? Buffer.from([value])
    : Buffer.from(value.toString(16).padStart(8, '0'), 'hex') });

test('captured on/off and dim echoes match exact tuple, independent of wire length', () => {
  const tracker = new TuyaCommandTracker();
  for (const data of [report(192, 1), report(59, 0), report(162, 406, 2)]) {
    tracker.record({ ...data, length: Buffer.from('0000', 'hex') });
    assert.deepEqual(tracker.classify(data, 2), {});
    assert.deepEqual(tracker.classify({ ...data, length: Buffer.from('0001', 'hex') }, 1),
      { matched: true, stale: false });
    assert.deepEqual(tracker.classify(data, 1), { duplicate: true });
  }
});

test('every tuple field matters; same value with unrelated transaction is not an echo', () => {
  const tracker = new TuyaCommandTracker();
  const data = report(10, 1);
  tracker.record(data);
  for (const change of [{ status: 1 }, { transid: 11 }, { dp: 2 },
    { datatype: 2 }, { data: Buffer.from([0]) }]) {
    assert.deepEqual(tracker.classify({ ...data, ...change }, 1), {});
  }
  assert.deepEqual(tracker.classify(data, 1), { matched: true, stale: false });
});

test('late echoes cannot revert a newer command or an intervening physical change', () => {
  const tracker = new TuyaCommandTracker();
  const on = report(3, 1), off = report(4, 0);
  tracker.record(on); tracker.record(off);
  assert.deepEqual(tracker.classify(off, 1), { matched: true, stale: false });
  assert.deepEqual(tracker.classify(on, 1), { matched: true, stale: true });
  tracker.record(on); tracker.noteDeviceChange(1);
  assert.deepEqual(tracker.classify(on, 1), { matched: true, stale: true });
  tracker.record(off); tracker.noteDeviceChange(2);
  assert.deepEqual(tracker.classify(off, 1), { matched: true, stale: false });
});

test('reused transaction with a new command matches once; consumed duplicate stays known', () => {
  const tracker = new TuyaCommandTracker(), data = report(11, 1);
  tracker.record(data); tracker.classify(data, 1);
  tracker.record(data);
  assert.deepEqual(tracker.classify(data, 1), { matched: true, stale: false });
  assert.deepEqual(tracker.classify(data, 1), { duplicate: true });
});

test('one echo suffices for two identical overlapping commands sharing a random ID', () => {
  const tracker = new TuyaCommandTracker(), data = report(11, 1);
  tracker.record(data); tracker.record(data);
  assert.deepEqual(tracker.classify(data, 1), { matched: true, stale: false });
  assert.deepEqual(tracker.classify(data, 1), { matched: true, stale: true });
  assert.deepEqual(tracker.classify(data, 1), { duplicate: true });
});

test('random echo sequences cannot suppress autonomous reports or distinct payloads', () => {
  const tracker = new TuyaCommandTracker();
  assert.equal(tracker.isRepeated(report(623, 0), 2), false);
  assert.equal(tracker.isRepeated(report(640, 1), 1), false);
  assert.equal(tracker.isRepeated(report(624, 1), 2), false);
  assert.equal(tracker.isRepeated(report(624, 1), 2), true);
  assert.equal(tracker.isRepeated(report(624, 0), 2), false);
  assert.equal(tracker.isRepeated(report(622, 1), 2), true);
  assert.equal(tracker.isRepeated(report(639, 0), 1), false);
});

test('ledger expires and is bounded, preferring consumed entries for eviction', () => {
  let now = 100;
  const tracker = new TuyaCommandTracker(() => now);
  for (let i = 0; i < MAX_COMMANDS; i++) tracker.record(report(i, 1));
  tracker.classify(report(20, 1), 1);
  tracker.record(report(100, 1));
  assert.equal(tracker.commands.length, MAX_COMMANDS);
  assert.equal(tracker.evicted, 1);
  assert.deepEqual(tracker.classify(report(20, 1), 1), {});
  assert.equal(tracker.classify(report(0, 1), 1).matched, true);
  now += TTL_MS;
  assert.deepEqual(tracker.classify(report(100, 1), 1), {});
  assert.equal(tracker.commands.length, 0);
});

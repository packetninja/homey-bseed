'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const TUYA_CLUSTER_ID = 0xEF00;
const MAX_PENDING_REPLIES = 64;
const LOG_INTERVAL_MS = 30_000;
const attachments = new WeakMap();
const activeStates = new Set();
let globalActualPending = 0;
let globalPeak = 0;
let aggregateLogTimer = null;

/**
 * Coalesce duplicate Tuya 0xEF00 Default Responses while leaving delivery of every
 * received frame untouched. The map deliberately holds at most 64 in-flight replies
 * per low-level node; a new reply beyond that limit is sent normally rather than
 * risking eviction of a response already being processed.
 *
 * @param {object} device Homey device with a low-level `node` and optional `log`.
 * @returns {{snapshot: () => object, detach: () => void}} attachment diagnostics/control
 */
function attach(device) {
  const node = device?.node;
  if (!node || typeof node.handleFrame !== 'function' || typeof node.sendFrame !== 'function') {
    throw new TypeError('TuyaPendingReplies.attach requires device.node.handleFrame and sendFrame');
  }

  const existing = attachments.get(node);
  if (existing) return existing.api;

  const state = createState(device, node, node.handleFrame, node.sendFrame);

  state.handleFrameWrapper = function handleFrameWrapper(...args) {
    if (!state.active) return state.originalHandleFrame.apply(node, args);
    const [endpointId, clusterId, frame, meta] = args;
    const incoming = createIncomingContext(state, endpointId, clusterId, frame, meta);
    return state.context.run(incoming, () => state.originalHandleFrame.apply(node, args));
  };

  state.sendFrameWrapper = function sendFrameWrapper(endpointId, clusterId, frame, ...rest) {
    if (!state.active) return state.originalSendFrame.apply(node, [endpointId, clusterId, frame, ...rest]);
    const incoming = state.context.getStore();
    const match = getMatchingReply(incoming, endpointId, clusterId, frame);
    if (!match) return state.originalSendFrame.apply(node, [endpointId, clusterId, frame, ...rest]);

    const pending = state.pending.get(match.key);
    if (pending) {
      pending.duplicates += 1;
      state.stats.coalesced += 1;
      return pending.promise;
    }

    if (state.pending.size >= MAX_PENDING_REPLIES) {
      state.stats.overflow += 1;
      return state.originalSendFrame.apply(node, [endpointId, clusterId, frame, ...rest]);
    }

    const entry = {
      duplicates: 0,
      promise: null,
    };
    entry.promise = sendWithOneTrailingRetry(state, entry, () => (
      state.originalSendFrame.apply(node, [endpointId, clusterId, frame, ...rest])
    ));
    state.pending.set(match.key, entry);
    state.stats.peak = Math.max(state.stats.peak, state.pending.size);
    entry.promise.finally(() => state.pending.delete(match.key)).catch(() => {});
    return entry.promise;
  };

  node.handleFrame = state.handleFrameWrapper;
  node.sendFrame = state.sendFrameWrapper;

  const api = {
    snapshot: () => snapshotState(state),
    detach: () => detach(state),
  };
  state.api = api;
  attachments.set(node, state);
  activeStates.add(state);
  ensureAggregateLogTimer();
  return api;
}

/**
 * Return the diagnostic summary for an attached low-level node or device.
 * @param {object} deviceOrNode Homey device or its low-level node
 * @returns {object|null} the current summary, or null when not attached
 */
function snapshot(deviceOrNode) {
  const node = deviceOrNode?.node || deviceOrNode;
  const state = attachments.get(node);
  return state ? snapshotState(state) : null;
}

function createState(device, node, originalHandleFrame, originalSendFrame) {
  return {
    active: true,
    api: null,
    context: new AsyncLocalStorage(),
    device,
    handleFrameWrapper: null,
    node,
    originalHandleFrame,
    originalSendFrame,
    pending: new Map(),
    sendFrameWrapper: null,
    stats: {
      attempts: 0,
      coalesced: 0,
      success: 0,
      fail: 0,
      retries: 0,
      overflow: 0,
      peak: 0,
      latencyCount: 0,
      latencyTotalMs: 0,
      latencyMinMs: null,
      latencyMaxMs: null,
    },
  };
}

function createIncomingContext(state, endpointId, clusterId, frame, meta) {
  return {
    state,
    endpointId,
    clusterId,
    frameHex: Buffer.isBuffer(frame) ? frame.toString('hex') : null,
    meta,
  };
}

function getMatchingReply(incoming, endpointId, clusterId, reply) {
  if (!incoming || incoming.state === undefined || incoming.clusterId !== TUYA_CLUSTER_ID) return null;
  if (incoming.endpointId !== endpointId || clusterId !== TUYA_CLUSTER_ID) return null;
  if (incoming.meta?.broadcast === true
    || incoming.meta?.isBroadcast === true
    || typeof incoming.meta?.groupId === 'number') return null;
  if (!incoming.frameHex || !Buffer.isBuffer(reply)) return null;

  const source = Buffer.from(incoming.frameHex, 'hex');
  if (source.length < 3 || source[0] !== 0x09 || (source[2] !== 0x01 && source[2] !== 0x02)) {
    return null;
  }
  if (reply.length !== 5
    || reply[0] !== 0x10
    || reply[1] !== source[1]
    || reply[2] !== 0x0B
    || reply[3] !== source[2]
    || reply[4] !== 0x00) {
    return null;
  }

  const replyHex = reply.toString('hex');
  return {
    key: `${endpointId}:${incoming.frameHex}:${replyHex}`,
  };
}

async function sendWithOneTrailingRetry(state, entry, send) {
  try {
    return await attemptSend(state, send);
  } catch (error) {
    if (entry.duplicates === 0) throw error;
    state.stats.retries += 1;
    return attemptSend(state, send);
  }
}

async function attemptSend(state, send) {
  const startedAt = Date.now();
  state.stats.attempts += 1;
  globalActualPending += 1;
  globalPeak = Math.max(globalPeak, globalActualPending);
  try {
    const result = await send();
    state.stats.success += 1;
    recordLatency(state.stats, Date.now() - startedAt);
    return result;
  } catch (error) {
    state.stats.fail += 1;
    recordLatency(state.stats, Date.now() - startedAt);
    throw error;
  } finally {
    globalActualPending -= 1;
  }
}

function recordLatency(stats, latencyMs) {
  stats.latencyCount += 1;
  stats.latencyTotalMs += latencyMs;
  stats.latencyMinMs = stats.latencyMinMs === null ? latencyMs : Math.min(stats.latencyMinMs, latencyMs);
  stats.latencyMaxMs = stats.latencyMaxMs === null ? latencyMs : Math.max(stats.latencyMaxMs, latencyMs);
}

function snapshotState(state) {
  const { stats } = state;
  return {
    attempts: stats.attempts,
    coalesced: stats.coalesced,
    success: stats.success,
    fail: stats.fail,
    retries: stats.retries,
    overflow: stats.overflow,
    pending: state.pending.size,
    peak: stats.peak,
    globalActualPending,
    globalPeak,
    latencyMs: {
      count: stats.latencyCount,
      min: stats.latencyMinMs,
      max: stats.latencyMaxMs,
      avg: stats.latencyCount === 0 ? null : stats.latencyTotalMs / stats.latencyCount,
    },
  };
}

function ensureAggregateLogTimer() {
  if (aggregateLogTimer || activeStates.size === 0) return;
  aggregateLogTimer = setInterval(logAggregateSummary, LOG_INTERVAL_MS);
  aggregateLogTimer.unref?.();
}

function logAggregateSummary() {
  const states = Array.from(activeStates);
  if (states.length === 0) return;
  const summary = states.reduce((total, state) => {
    const { stats } = state;
    total.trackedAttempts += stats.attempts;
    total.coalesced += stats.coalesced;
    total.trackedSuccess += stats.success;
    total.trackedFail += stats.fail;
    total.retries += stats.retries;
    total.overflow += stats.overflow;
    total.pending += state.pending.size;
    total.latencyCount += stats.latencyCount;
    total.latencyTotalMs += stats.latencyTotalMs;
    if (stats.latencyMinMs !== null) {
      total.latencyMinMs = total.latencyMinMs === null
        ? stats.latencyMinMs
        : Math.min(total.latencyMinMs, stats.latencyMinMs);
      total.latencyMaxMs = total.latencyMaxMs === null
        ? stats.latencyMaxMs
        : Math.max(total.latencyMaxMs, stats.latencyMaxMs);
    }
    return total;
  }, {
    deviceCount: states.length,
    trackedAttempts: 0,
    coalesced: 0,
    trackedSuccess: 0,
    trackedFail: 0,
    retries: 0,
    overflow: 0,
    pending: 0,
    actualPending: globalActualPending,
    actualPeak: globalPeak,
    latencyCount: 0,
    latencyTotalMs: 0,
    latencyMinMs: null,
    latencyMaxMs: null,
  });
  summary.weightedLatencyMs = summary.latencyCount === 0
    ? null
    : summary.latencyTotalMs / summary.latencyCount;
  delete summary.latencyTotalMs;
  try {
    states[0].device.log?.('[ACK-COALESCE][GLOBAL]', JSON.stringify(summary));
  } catch {
    // Diagnostics must never affect Zigbee frame handling.
  }
}

function detach(state) {
  if (!state.active) return;
  state.active = false;
  activeStates.delete(state);
  attachments.delete(state.node);
  if (state.node.handleFrame === state.handleFrameWrapper) {
    state.node.handleFrame = state.originalHandleFrame;
  }
  if (state.node.sendFrame === state.sendFrameWrapper) {
    state.node.sendFrame = state.originalSendFrame;
  }
  if (activeStates.size === 0 && aggregateLogTimer) {
    clearInterval(aggregateLogTimer);
    aggregateLogTimer = null;
  }
}

module.exports = {
  attach,
  snapshot,
  MAX_PENDING_REPLIES,
};

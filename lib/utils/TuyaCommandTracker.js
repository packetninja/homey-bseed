'use strict';

const TTL_MS = 120_000;
const MAX_COMMANDS = 64;

function key(data) {
  if (!data || !Number.isInteger(data.status) || !Number.isInteger(data.transid)
    || !Number.isInteger(data.dp) || !Number.isInteger(data.datatype)
    || !Buffer.isBuffer(data.data)) return null;
  return `${data.status}:${data.transid}:${data.dp}:${data.datatype}:${data.data.toString('hex')}`;
}

/** Tracks exact command echoes separately from the device's autonomous sequence. */
class TuyaCommandTracker {
  constructor(now = Date.now) {
    this.now = now;
    this.commands = [];
    this.order = 0;
    this.latest = new Map();
    this.revisions = new Map();
    this.domains = new Map();
    this.evicted = 0;
  }

  /** Record before sending; a rejected send may still have reached the device. */
  record(data) {
    this._prune();
    if (this.commands.length >= MAX_COMMANDS) {
      const consumed = this.commands.findIndex(entry => entry.consumed);
      this.commands.splice(consumed < 0 ? 0 : consumed, 1);
      this.evicted++;
    }
    const entry = { key: key(data), dp: data.dp, order: ++this.order,
      revision: this.revisions.get(data.dp) || 0, at: this.now(), consumed: false };
    this.latest.set(data.dp, entry.order);
    this.commands.push(entry);
  }

  /** Command 0x01 echoes were verified against physical 0x02 reports on the live dimmer. */
  classify(data, commandId) {
    if (commandId !== 1) return {};
    this._prune();
    const identity = key(data);
    if (!identity) return {};
    const matches = this.commands.filter(entry => entry.key === identity);
    // Identical overlapping commands can reuse the random 8-bit ID. One echo
    // must synchronize the newest request even if a second echo is lost.
    const entry = matches.slice().reverse().find(candidate => !candidate.consumed);
    if (!entry) return matches.length ? { duplicate: true } : {};
    entry.consumed = true;
    return { matched: true, stale: entry.order !== this.latest.get(entry.dp)
      || entry.revision !== (this.revisions.get(entry.dp) || 0) };
  }

  /** A subsequent physical change supersedes an outstanding command confirmation. */
  noteDeviceChange(dp) {
    this.revisions.set(dp, (this.revisions.get(dp) || 0) + 1);
  }

  /** Exact duplicates share a domain; only autonomous reports have ordered sequences. */
  isRepeated(data, commandId) {
    const identity = key(data);
    if (!identity) return false;
    const domainId = commandId ?? 'unknown';
    let domain = this.domains.get(domainId);
    if (!domain) {
      domain = { recent: new Set(), lastSeq: null };
      this.domains.set(domainId, domain);
    }
    if (domain.recent.has(identity)) return true;
    const seq = ((data.status & 255) << 8) | (data.transid & 255);
    if (commandId === 2 && domain.lastSeq !== null) {
      const behind = (domain.lastSeq - seq + 65536) & 65535;
      if (behind > 0 && behind < 32) return true;
    }
    domain.lastSeq = seq;
    domain.recent.add(identity);
    if (domain.recent.size > 128) domain.recent.delete(domain.recent.values().next().value);
    return false;
  }

  _prune() {
    const cutoff = this.now() - TTL_MS;
    this.commands = this.commands.filter(entry => entry.at > cutoff);
  }
}

module.exports = { TuyaCommandTracker, TTL_MS, MAX_COMMANDS };

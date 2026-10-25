import { readdirSync, readFileSync } from 'node:fs';
import { endianness } from 'node:os';
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
if (process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch) || endianness() !== 'LE') throw Error('S10 requires Linux x64/arm64 little-endian /proc instrumentation');
const auxv = readFileSync('/proc/self/auxv'), units = new Map();
for (let offset = 0; offset + 16 <= auxv.length; offset += 16) units.set(Number(auxv.readBigUInt64LE(offset)), Number(auxv.readBigUInt64LE(offset + 8)));
export const pageSize = units.get(6), clockTicksPerSecond = units.get(17);
if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || !Number.isSafeInteger(clockTicksPerSecond) || clockTicksPerSecond <= 0) throw Error('Missing Linux process measurement units');
export function readProcess(pid) {
  try {
    const source = readFileSync(`/proc/${pid}/stat`, 'utf8'), fields = source.slice(source.lastIndexOf(')') + 2).split(' ');
    return { pid, state: fields[0], ppid: Number(fields[1]), group: Number(fields[2]), session: Number(fields[3]), start: fields[19], cpuTicks: Number(fields[11]) + Number(fields[12]), rssBytes: Number(fields[21]) * pageSize };
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return null; throw error; }
}
export function processTable() { return readdirSync('/proc').filter(x => /^\d+$/.test(x)).map(x => readProcess(Number(x))).filter(Boolean); }
export function signalProcess(expected, signal, { read = readProcess, kill = process.kill } = {}) {
  if (!expected || expected.pid <= 1 || expected.pid === process.pid) throw Error('Unsafe signal target');
  const current = read(expected.pid);
  if (!current || current.start !== expected.start) return { pid: expected.pid, sent: false, reason: current ? 'identity-changed' : 'gone' };
  try { kill(current.pid, signal); return { pid: current.pid, sent: true }; }
  catch (error) { if (error.code === 'ESRCH') return { pid: current.pid, sent: false, reason: 'gone' }; throw error; }
}
export class ProcessTree {
  known = new Map(); sessions = new Map(); samples = []; identitySkips = [];
  constructor(pid, { table = processTable, read = readProcess, kill = process.kill } = {}) {
    if (process.platform !== 'linux' || !Number.isSafeInteger(pid) || pid === process.pid) throw Error('S10 requires a separate Linux worker');
    this.root = pid; this.started = performance.now(); this.table = table; this.read = read; this.kill = kill;
    const root = table().find(p => p.pid === pid);
    if (!root || root.session !== pid || root.group !== pid) throw Error('Worker must own a detached session/process group');
    this.known.set(pid, root); this.sessions.set(pid, { leaderStart: root.start, members: new Map([[pid, root.start]]) });
  }
  liveSession(sid) {
    const session = this.sessions.get(sid); if (!session) return false;
    const leader = this.read(sid);
    if (leader && leader.start !== session.leaderStart) return false;
    // A numeric SID alone is never ownership: an already owned, unchanged member must still anchor it.
    return [...session.members].some(([pid, start]) => { const member = this.read(pid); return member?.start === start && member.session === sid; });
  }
  scan(record = true) {
    const table = this.table(); let changed = true;
    for (const sid of this.sessions.keys()) if (!this.liveSession(sid)) this.sessions.delete(sid);
    while (changed) {
      changed = false;
      for (const p of table) {
        const old = this.known.get(p.pid); if (old && old.start !== p.start) continue;
        const parent = this.known.get(p.ppid), currentParent = parent ? this.read(parent.pid) : null;
        if (old || (parent && currentParent?.start === parent.start) || this.liveSession(p.session)) {
          const current = this.read(p.pid); if (!current || current.start !== p.start || current.session !== p.session) continue;
          if (!old) { this.known.set(p.pid, p); changed = true; }
          if (p.session === p.pid && !this.sessions.has(p.session)) { this.sessions.set(p.session, { leaderStart: p.start, members: new Map() }); changed = true; }
          this.sessions.get(p.session)?.members.set(p.pid, p.start);
        }
      }
    }
    const owned = table.filter(p => this.known.get(p.pid)?.start === p.start);
    if (record) this.samples.push({ elapsedMs: Math.round(performance.now() - this.started), rssBytes: owned.reduce((n, p) => n + p.rssBytes, 0), cpuTicks: owned.reduce((n, p) => n + p.cpuTicks, 0), processes: owned });
    return { table, owned };
  }
  signal(expected, signal) {
    const outcome = signalProcess(expected, signal, { read: this.read, kill: this.kill });
    if (!outcome.sent && outcome.reason === 'identity-changed') this.identitySkips.push(outcome);
    return outcome;
  }
  browser(pid) {
    const { owned } = this.scan(); if (!owned.some(p => p.pid === pid)) throw Error('Browser PID is not owned by the worker tree'); this.browserPid = pid;
  }
  async cleanup() {
    for (let round = 0; round < 3; round++) {
      for (const p of this.scan(false).owned) if (p.state !== 'Z') this.signal(p, 'SIGSTOP');
      await pause(25);
    }
    // No numeric process-group signals: individually re-read each start-time-bound identity immediately before signalling.
    for (const p of this.scan(false).owned) this.signal(p, 'SIGKILL');
    let remaining;
    for (let i = 0; i < 20; i++) { await pause(50); remaining = this.scan(false).owned; if (!remaining.some(p => p.state !== 'Z')) break; }
    return { browserPid: this.browserPid ?? null, trackedPids: [...this.known.keys()], identitySkips: this.identitySkips, remainingActive: remaining.filter(p => p.state !== 'Z'), remainingZombies: remaining.filter(p => p.state === 'Z') };
  }
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validCIContext } from './baseline-context.mjs';
import { readProcess } from './resource-process.mjs';
export const CALIBRATION_RSS_CAP = 1280 * 1024 * 1024;
export const RESERVE_FLOOR = 1024 * 1024 * 1024;
export const ADMISSION_HEADROOM = CALIBRATION_RSS_CAP + RESERVE_FLOOR;
const bytes = value => {
  if (!/^\d+$/.test(value.trim())) throw Error('Invalid memory counter');
  const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw Error('Invalid memory counter'); return n;
};
function kib(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s+(\\d+) kB$`, 'm')); if (!match) throw Error(`Missing ${key}`);
  const n = bytes(match[1]) * 1024; if (!Number.isSafeInteger(n)) throw Error('Memory value overflow'); return n;
}
export function parseSmaps(source) {
  const privateHuge = /^Private_Hugetlb:/m.test(source) ? kib(source, 'Private_Hugetlb') : 0;
  return { rollupRssBytes: kib(source, 'Rss'), pssBytes: kib(source, 'Pss'), privateBytes: kib(source, 'Private_Clean') + kib(source, 'Private_Dirty') + privateHuge };
}
export function reserveSnapshot(read = file => readFileSync(file, 'utf8')) {
  try {
    const meminfo = read('/proc/meminfo'), host = { totalBytes: kib(meminfo, 'MemTotal'), availableBytes: kib(meminfo, 'MemAvailable') };
    const membership = read('/proc/self/cgroup').trim().split('\n').filter(line => line.startsWith('0::'));
    const mounts = read('/proc/self/mountinfo').trim().split('\n').filter(line => line.includes(' - cgroup2 '));
    if (membership.length !== 1 || mounts.length !== 1) throw Error('Unknown cgroup-v2 membership/mount');
    const unescape = value => value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    const mountFields = mounts[0].split(' '), mountRoot = unescape(mountFields[3]), mountPoint = unescape(mountFields[4]);
    if (mountRoot !== '/') return { known: false, reason: 'hidden-cgroup-ancestors', host, mountRoot, mountPoint };
    const member = membership[0].slice(3);
    if (!member.startsWith('/') || member.split('/').includes('..') || !mountPoint.startsWith('/')) throw Error('Invalid cgroup path');
    const root = path.resolve(mountPoint), leaf = path.resolve(root, '.' + member);
    if (leaf !== root && !leaf.startsWith(root + '/')) throw Error('Cgroup path escapes mount');
    const groups = [];
    for (let dir = leaf; ; dir = path.dirname(dir)) {
      const limit = name => { const value = read(`${dir}/${name}`).trim(); return value === 'max' ? null : bytes(value); };
      const events = read(`${dir}/memory.events`);
      const count = name => { const match = events.match(new RegExp(`^${name} (\\d+)$`, 'm')); if (!match) throw Error('Missing cgroup memory event'); return bytes(match[1]); };
      groups.push({ path: dir, currentBytes: bytes(read(`${dir}/memory.current`)), maxBytes: limit('memory.max'), highBytes: limit('memory.high'), oom: count('oom'), oomKill: count('oom_kill') });
      if (dir === root) break; if (groups.length >= 64) throw Error('Cgroup hierarchy too deep');
    }
    if (host.availableBytes > host.totalBytes) throw Error('Inconsistent host memory');
    // A slash mount can be a virtual cgroup-namespace root. These counters do not attest hidden host ancestors.
    return { known: false, reason: 'cgroup-namespace-unproven', host, mountRoot, mountPoint, groups, observedOnly: true };
  } catch (error) { return { known: false, reason: 'memory-reserve-unknown', error: String(error) }; }
}
export function headroomDecision(snapshot, requiredBytes = ADMISSION_HEADROOM) {
  const safe = n => Number.isSafeInteger(n) && n >= 0;
  if (snapshot.reason !== 'cgroup-namespace-unproven' || snapshot.mountRoot !== '/' || !snapshot.host || !safe(snapshot.host.totalBytes) || !safe(snapshot.host.availableBytes) || snapshot.host.availableBytes > snapshot.host.totalBytes || !Array.isArray(snapshot.groups) || !snapshot.groups.length) return { ok: false, reason: snapshot.reason ?? 'memory-reserve-unknown' };
  if (snapshot.host.availableBytes < requiredBytes) return { ok: false, reason: 'host-reserve-insufficient' };
  for (const group of snapshot.groups) {
    if (!safe(group.currentBytes) || !safe(group.oom) || !safe(group.oomKill) || ![group.maxBytes, group.highBytes].every(limit => limit === null || safe(limit))) return { ok: false, reason: 'memory-reserve-unknown' };
    for (const limit of [group.maxBytes, group.highBytes]) if (limit !== null && limit - group.currentBytes < requiredBytes) return { ok: false, reason: 'cgroup-reserve-insufficient' };
  }
  return { ok: true, requiredBytes, providerAssumption: 'verified GitHub-hosted ubuntu-24.04 guest workflow; not a kernel-hierarchy proof' };
}
export function assessReserve(snapshot, requiredBytes = ADMISSION_HEADROOM, context = null) {
  if (!validCIContext(context)) return { ok: false, reason: 'ci-context-unverified' };
  return headroomDecision(snapshot, requiredBytes);
}
export function treeMemory(tree, { read = file => readFileSync(file, 'utf8'), identity = readProcess } = {}) {
  const { owned } = tree.scan(false), rows = [], skipped = [];
  for (const expected of owned.filter(p => p.state !== 'Z')) {
    const before = identity(expected.pid);
    if (!before || before.start !== expected.start) { skipped.push(expected.pid); continue; }
    let rollup;
    try { rollup = parseSmaps(read(`/proc/${expected.pid}/smaps_rollup`)); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') { skipped.push(expected.pid); continue; } throw error; }
    const after = identity(expected.pid);
    if (!after || after.start !== expected.start) { skipped.push(expected.pid); continue; }
    rows.push({ pid: expected.pid, start: expected.start, rssBytes: before.rssBytes, ...rollup });
  }
  return { rssBytes: rows.reduce((n, p) => n + p.rssBytes, 0), rollupRssBytes: rows.reduce((n, p) => n + p.rollupRssBytes, 0), pssBytes: rows.reduce((n, p) => n + p.pssBytes, 0), privateBytes: rows.reduce((n, p) => n + p.privateBytes, 0), processes: rows, skippedPids: skipped };
}

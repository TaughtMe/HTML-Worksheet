import assert from 'node:assert/strict';
import { ADMISSION_HEADROOM, CALIBRATION_RSS_CAP, RESERVE_FLOOR, reserveSnapshot, assessReserve, parseSmaps, treeMemory } from './baseline-memory.mjs';
const gib = 1024 ** 3;
const files = new Map([
  ['/proc/meminfo', 'MemTotal:       8388608 kB\nMemAvailable:   7340032 kB\n'],
  ['/proc/self/cgroup', '0::/job\n'],
  ['/proc/self/mountinfo', '10 9 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n'],
]);
for (const path of ['/sys/fs/cgroup', '/sys/fs/cgroup/job']) {
  files.set(path + '/memory.current', String(gib)); files.set(path + '/memory.max', String(8 * gib)); files.set(path + '/memory.high', 'max'); files.set(path + '/memory.events', 'oom 0\noom_kill 0\n');
}
const read = file => { if (!files.has(file)) throw Error('Missing fixture file'); return files.get(file); };
const virtualSlash = reserveSnapshot(read);
assert.equal(virtualSlash.known, false); assert.equal(virtualSlash.reason, 'cgroup-namespace-unproven'); assert.equal(virtualSlash.groups.length, 2); assert.equal(virtualSlash.observedOnly, true);
assert.equal(assessReserve(virtualSlash).ok, false);
assert.equal(CALIBRATION_RSS_CAP, 1280 * 1024 * 1024); assert.equal(ADMISSION_HEADROOM, CALIBRATION_RSS_CAP + RESERVE_FLOOR);
// Large visible headroom and a caller-supplied boolean cannot create trustworthy namespace evidence.
assert.equal(assessReserve({ ...virtualSlash, known: true, reason: undefined }).reason, 'ci-context-unverified');
files.set('/proc/self/cgroup', '0::/\n');
assert.equal(assessReserve(reserveSnapshot(read)).ok, false); // A virtual slash membership is not the initial host namespace.
files.set('/proc/self/mountinfo', '10 9 0:1 /.. /sys/fs/cgroup rw - cgroup2 cgroup rw\n'); assert.equal(reserveSnapshot(read).reason, 'hidden-cgroup-ancestors');
files.set('/proc/self/cgroup', '0::/job\n'); files.set('/proc/self/mountinfo', '10 9 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n'); files.delete('/sys/fs/cgroup/job/memory.current'); assert.equal(assessReserve(reserveSnapshot(read)).ok, false);
const smaps = 'Rss:                100 kB\nPss:                 60 kB\nPrivate_Clean:       10 kB\nPrivate_Dirty:       20 kB\nPrivate_Hugetlb:      2 kB\n';
assert.deepEqual(parseSmaps(smaps), { rollupRssBytes: 102400, pssBytes: 61440, privateBytes: 32768 });
assert.throws(() => parseSmaps(smaps.replace('Pss:', 'Unknown:')));
const process = { pid: 1234, start: '10', state: 'S', rssBytes: 102400 };
const tree = { scan: () => ({ owned: [process] }) };
assert.equal(treeMemory(tree, { read: () => smaps, identity: () => process }).privateBytes, 32768);
let calls = 0;
const reused = treeMemory(tree, { read: () => smaps, identity: () => ++calls === 1 ? process : { ...process, start: '11' } });
assert.equal(reused.pssBytes, 0); assert.deepEqual(reused.skippedPids, [1234]);
assert.throws(() => treeMemory(tree, { read: () => { throw Object.assign(Error('Denied'), { code: 'EACCES' }); }, identity: () => process }));
console.log('Baseline focused checks passed: virtual slash/hidden namespace refusal and non-overridable admission, smaps units, PID identity and unreadable metrics; no browser started');

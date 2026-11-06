// G1-X04-MSG01/MSG02: real host/runner/session/port. Other phases, deadlines and sources remain untested here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const protocolCases = Object.freeze(['sequence-gap', 'duplicate-ready', 'unknown-payload-field', 'additional-port']);
export const phaseCases = Object.freeze(['duplicate-restored', 'unsolicited-snapshot']);
function fixtureRuntime(attack, hostileValue) {
  let port, sessionId, acknowledgement = null;
  globalThis.msg01Identity = () => ({ sessionId, acknowledgement });
  addEventListener('message', event => {
    if (event.source !== parent) return;
    if (event.data?.type === 'INIT' && event.ports.length === 1 && !port) {
      port = event.ports[0]; sessionId = event.data.sessionId;
      // Observe alongside the real adapter; never replace its handler.
      port.addEventListener('message', e => {
        const message = JSON.parse(e.data);
        if (message.type === 'STATE_ACCEPTED') acknowledgement = message.payload;
      });
    } else if (event.data?.type === 'MSG01_RUN' && event.ports.length === 1 && port) {
      const report = event.ports[0], extra = new MessageChannel();
      const payload = { changeId: 2, baseRevision: 1, state: { schemaVersion: 1, fields: [{ id: 'answer', kind: 'text', value: hostileValue }] } };
      const message = { v: 1, sessionId, seq: 4, type: 'STATE_CHANGED', payload };
      if (attack === 'sequence-gap') message.seq = 5;
      if (attack === 'duplicate-ready') { message.type = 'READY'; message.payload = { adapterId: 'standard-fields', adapterVersion: 1 }; }
      if (attack === 'duplicate-restored') { message.type = 'RESTORED'; message.payload = { requestId: 1, revision: 0 }; }
      if (attack === 'unsolicited-snapshot') { message.type = 'STATE_SNAPSHOT'; message.payload = { requestId: 2, baseRevision: 1, state: payload.state }; }
      if (attack === 'unknown-payload-field') message.payload.unexpected = true;
      const transfer = attack === 'additional-port' ? [extra.port2] : [], data = JSON.stringify(message);
      try {
        report.postMessage({ kind: 'prepared', data, transferredPorts: transfer.length, acknowledgement });
        port.postMessage(data, transfer);
        // Independent parent-owned port: evidence survives removal of this runner.
        report.postMessage({ kind: 'sent' });
      } catch (error) { report.postMessage({ kind: 'send-error', error: String(error) }); }
      finally { extra.port1.close(); if (!transfer.length) extra.port2.close(); }
    }
  });
}
function installOracle() {
  const evidence = globalThis.msg01Evidence = { states: [], statuses: [], messages: [], overflow: false };
  const texts = records => records.flatMap(r => r.type === 'childList'
    ? [...r.addedNodes].map(node => node.textContent)
    : [r.oldValue, r.target.data]).filter(text => typeof text === 'string');
  const collect = (key, records) => {
    evidence[key].push(...texts(records));
    if (evidence[key].length > 64) { evidence.overflow = true; evidence[key].length = 64; }
  };
  const options = { childList: true, subtree: true, characterData: true, characterDataOldValue: true };
  const observers = ['state', 'status'].map(id => {
    const key = id === 'state' ? 'states' : 'statuses', element = document.getElementById(id);
    evidence[key].push(element.textContent);
    const observer = new MutationObserver(records => collect(key, records)); observer.observe(element, options); return observer;
  });
  // Positive control: an added text node must remain observable after synchronous clear.
  const probe = document.createElement('pre'), probeObserver = new MutationObserver(() => {});
  probeObserver.observe(probe, options); probe.textContent = 'synthetic-render-then-clear'; probe.textContent = '';
  evidence.renderClearControl = texts(probeObserver.takeRecords()).includes('synthetic-render-then-clear'); probeObserver.disconnect();
  globalThis.msg01Stop = () => observers.forEach(observer => observer.disconnect());
}
export async function checkHostPortProtocol({ page, load, active }, attack) {
  assert(protocolCases.includes(attack) || phaseCases.includes(attack));
  const packageId = phaseCases.includes(attack) ? 'MSG02' : 'MSG01';
  const acceptedValue = `accepted-${attack}`, hostileValue = `rejected-${attack}`;
  const source = `<input id="answer"><script>(${fixtureRuntime.toString()})(${JSON.stringify(attack)},${JSON.stringify(hostileValue)})<\/script>`;
  let before, identity;
  try {
    await load(source, `${packageId.toLowerCase()}-${attack}.html`); await active();
    const frame = page.frames().find(f => f.parentFrame() === page.mainFrame()); assert(frame);
    await page.evaluate(installOracle);
    await frame.locator('#answer').fill(acceptedValue);
    await frame.waitForFunction(() => globalThis.msg01Identity().acknowledgement?.revision === 1, null, { timeout: 4000 });
    identity = await frame.evaluate(() => globalThis.msg01Identity());
    assert.match(identity.sessionId, /^[a-f0-9]{32}$/);
    assert.deepEqual(identity.acknowledgement, { changeId: 1, revision: 1, durability: 'memory' });
    before = JSON.parse(await page.locator('#state').textContent());
    assert.deepEqual(before, { revision: 1, durability: 'memory', state: { schemaVersion: 1, fields: [{ id: 'answer', kind: 'text', value: acceptedValue }] } });
    await page.evaluate(() => {
      const channel = new MessageChannel();
      globalThis.msg01ReportPort = channel.port1;
      channel.port1.onmessage = event => {
        if (globalThis.msg01Evidence.messages.length >= 8) globalThis.msg01Evidence.overflow = true;
        else globalThis.msg01Evidence.messages.push(event.data);
      };
      document.querySelector('iframe').contentWindow.postMessage({ type: 'MSG01_RUN' }, '*', [channel.port2]);
    });
    await page.waitForFunction(() => globalThis.msg01Evidence.messages.some(m => m.kind === 'sent'), null, { timeout: 4000 });
    await page.waitForFunction(() => document.getElementById('status').textContent === 'closed · PROTOCOL', null, { timeout: 4000 });
    assert.equal(await page.locator('iframe').count(), 0);
    const evidence = await page.evaluate(() => globalThis.msg01Evidence);
    assert.equal(evidence.overflow, false); assert.equal(evidence.renderClearControl, true);
    assert.deepEqual(evidence.messages.map(m => m.kind), ['prepared', 'sent']);
    const prepared = evidence.messages[0], sent = JSON.parse(prepared.data);
    assert.equal(sent.sessionId, identity.sessionId); assert.equal(sent.v, 1);
    assert.equal(sent.seq, attack === 'sequence-gap' ? 5 : 4);
    assert.deepEqual(Object.keys(sent).sort(), ['payload', 'seq', 'sessionId', 'type', 'v']);
    assert.equal(sent.type, attack === 'duplicate-ready' ? 'READY' : attack === 'duplicate-restored' ? 'RESTORED' : attack === 'unsolicited-snapshot' ? 'STATE_SNAPSHOT' : 'STATE_CHANGED');
    assert.deepEqual(sent.payload, attack === 'duplicate-ready' ? { adapterId: 'standard-fields', adapterVersion: 1 }
      : attack === 'duplicate-restored' ? { requestId: 1, revision: 0 }
      : attack === 'unsolicited-snapshot' ? { requestId: 2, baseRevision: 1, state: { schemaVersion: 1, fields: [{ id: 'answer', kind: 'text', value: hostileValue }] } }
      : { changeId: 2, baseRevision: 1, state: { schemaVersion: 1, fields: [{ id: 'answer', kind: 'text', value: hostileValue }] }, ...(attack === 'unknown-payload-field' ? { unexpected: true } : {}) });
    assert.equal(prepared.transferredPorts, attack === 'additional-port' ? 1 : 0);
    assert.deepEqual(prepared.acknowledgement, identity.acknowledgement);
    const observedStates = evidence.states.filter(Boolean).map(text => JSON.parse(text));
    assert(observedStates.some(state => JSON.stringify(state) === JSON.stringify(before)), 'Real accepted state missing from mutation oracle');
    assert(observedStates.every(state => state.revision <= 1 && state.state.fields[0].value !== hostileValue), 'Rejected message committed before clear');
    assert.equal(await page.locator('#state').textContent(), '');
    await page.locator('#demo').click(); await active(); assert.equal(await page.locator('iframe').count(), 1);
    const fresh = JSON.parse(await page.locator('#state').textContent());
    assert.equal(fresh.revision, 0); assert(!JSON.stringify(fresh).includes(hostileValue)); assert(!JSON.stringify(fresh).includes(acceptedValue));
    return { caseId: `G1-X04-${packageId}/${attack}`, fixtureSha256: createHash('sha256').update(source).digest('hex'), before, ...evidence, freshRevision: fresh.revision };
  } catch (error) {
    error.detail = { attack, before, evidence: await page.evaluate(() => globalThis.msg01Evidence ?? null).catch(() => null) }; throw error;
  } finally {
    await page.evaluate(() => { globalThis.msg01Stop?.(); globalThis.msg01ReportPort?.close(); }).catch(() => {});
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeIdentity, decodeSnapshot, SessionBook, UploadQueue, snapshotBody, keyFor } from '../../app/javascript/ble/core.js'
const device = '00112233445566778899aabbccddeeff'
const snapshot = (overrides = {}) => ({ protocol_version: 1, state: 'slouching', session_id: 7, sequence: 181, tracked_seconds: 180, slouch_seconds: 70, episode_count: 1, ...overrides })
const view = hex => new DataView(Uint8Array.from(hex.split(' ').map(b => parseInt(b, 16))).buffer)
const stored = reading => ({ device_id: device, device_session_id: reading.session_id, snapshot: snapshotBody(reading), ended: reading.state === 'ended' })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function harness(request, overrides = {}) {
  let clock = 0
  const calls = [], states = [], saved = []
  const queue = new UploadQueue({ request: async (path, options) => {
    calls.push({ path, ...options })
    if (options.method === 'POST') return { status: 200, body: { device: { device_id: device } } }
    if (options.method === 'GET') return { status: 200, body: { session: null } }
    return request(path, options)
  }, now: () => clock, random: () => 0, setTimer: () => 1, clearTimer: () => {}, onChange: s => states.push(s), onSaved: s => saved.push(s), ...overrides })
  return { queue, calls, states, saved, tick: n => { clock += n } }
}
const success = (_, options) => ({ status: 200, body: { disposition: 'accepted', session: stored({ session_id: 7, ...options.body.snapshot }) } })

test('decodes identity in wire order and exact unsigned little-endian fixture including sliced buffers', () => {
  assert.equal(decodeIdentity(view('00 11 22 33 44 55 66 77 88 99 aa bb cc dd ee ff')), device)
  const bytes = Buffer.from('010307000000b5000000b4000000460000000100', 'hex')
  assert.deepEqual(decodeSnapshot(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)), snapshot())
  assert.equal(decodeSnapshot(view('01 02 ff ff ff ff ff ff ff ff ff ff ff ff 00 00 00 80 ff ff')).slouch_seconds, 2147483648)
})
test('rejects malformed lengths, version, state, zero revision, duration inversion and invalid session zero', () => {
  for (const hex of ['01', '02 03 07 00 00 00 b5 00 00 00 b4 00 00 00 46 00 00 00 01 00', '01 ff 07 00 00 00 b5 00 00 00 b4 00 00 00 46 00 00 00 01 00']) assert.throws(() => decodeSnapshot(view(hex)))
  const book = new SessionBook()
  for (const changes of [{ sequence: 0 }, { sequence: '1' }, { slouch_seconds: 181 }, { session_id: 0 }, { episode_count: 65536 }]) assert.throws(() => book.accept(device, snapshot(changes), 'date'))
})
test('session-zero sensor errors display but never upload; legacy short slouch time with no episode stays intact', () => {
  const book = new SessionBook()
  assert.equal(book.accept(device, snapshot({ session_id: 0, state: 'sensor_error', tracked_seconds: 0, slouch_seconds: 0, episode_count: 0 }), 'now').upload, false)
  const short = book.accept(device, snapshot({ tracked_seconds: 20, slouch_seconds: 10, episode_count: 0 }), 'now')
  assert.equal(short.snapshot.slouch_seconds, 10); assert.equal(short.snapshot.episode_count, 0)
})
test('notifications outrank late reads; equal conflicts and newer counter regressions fail', () => {
  const book = new SessionBook()
  book.accept(device, snapshot(), 'first')
  assert.equal(book.accept(device, snapshot({ sequence: 180 }), 'later').fresh, false)
  assert.equal(book.accept(device, snapshot(), 'later').fresh, false)
  assert.throws(() => book.accept(device, snapshot({ tracked_seconds: 181 }), 'later'))
  assert.throws(() => book.accept(device, snapshot({ sequence: 182, slouch_seconds: 69 }), 'later'))
  assert.equal(book.accept(device, snapshot({ sequence: 182, state: 'calibrating' }), 'later').firstObservedAt, 'first')
})
test('reboot/new session keeps old session ordering separate; old callback cannot become active', () => {
  const book = new SessionBook()
  book.accept(device, snapshot(), 'first')
  assert.equal(book.accept(device, snapshot({ session_id: 8, sequence: 1 }), 'second').display, true)
  assert.equal(book.accept(device, snapshot({ sequence: 182 }), 'third').display, false)
})
test('terminal repeats retain first terminal revision but refresh liveness; changed terminal counters fail', () => {
  const book = new SessionBook()
  book.accept(device, snapshot({ state: 'ended' }), 'first')
  const repeat = book.accept(device, snapshot({ state: 'ended', sequence: 182 }), 'later')
  assert.equal(repeat.fresh, true); assert.equal(repeat.upload, false); assert.equal(repeat.snapshot.sequence, 181)
  assert.throws(() => book.accept(device, snapshot({ state: 'ended', sequence: 183, tracked_seconds: 181 }), 'later'))
})
test('coalesces before upload and preserves first-observed time', async () => {
  const h = harness(success)
  h.queue.enqueue(device, snapshot(), 'first'); h.queue.enqueue(device, snapshot({ sequence: 182 }), 'later')
  await h.queue.flush(); assert.equal(h.calls.length, 0)
  h.tick(1000); await h.queue.flush()
  const put = h.calls.find(c => c.method === 'PUT')
  assert.equal(put.body.snapshot.sequence, 182); assert.equal(put.body.observation.first_observed_at, 'first'); assert.equal(h.queue.size, 0)
})
test('a newer reading during an in-flight write remains pending; no concurrent requests', async () => {
  const gate = deferred(); const h = harness((_, options) => gate.promise.then(() => success(_, options)))
  h.queue.enqueue(device, snapshot(), 'first'); h.tick(1000)
  const first = h.queue.flush(); await new Promise(setImmediate)
  h.queue.enqueue(device, snapshot({ sequence: 182, tracked_seconds: 181 }), 'second')
  await h.queue.flush(); assert.equal(h.calls.filter(c => c.method === 'PUT').length, 1)
  gate.resolve(); await first
  assert.equal(h.queue.size, 1); assert.equal(h.queue.pending.get(keyFor(device, 7)).snapshot.sequence, 182)
  h.tick(1000); await h.queue.flush(); assert.equal(h.queue.size, 0)
})
test('temporary failure retries the newest cumulative values after backoff, honors Retry-After', async () => {
  let attempts = 0
  const h = harness((p, o) => ++attempts === 1 ? { status: 429, retryAfter: '5', body: {} } : success(p, o))
  h.queue.enqueue(device, snapshot(), 'first'); h.tick(1000); await h.queue.flush()
  h.queue.enqueue(device, snapshot({ sequence: 182 }), 'later')
  h.tick(4999); await h.queue.flush(); assert.equal(attempts, 1)
  h.tick(1); await h.queue.flush(); assert.equal(attempts, 2); assert.equal(h.queue.size, 0)
})
test('queue never silently evicts a previous nonterminal session at capacity', () => {
  const h = harness(success, { limit: 1 })
  assert.equal(h.queue.enqueue(device, snapshot(), 'first'), true)
  assert.equal(h.queue.enqueue(device, snapshot({ session_id: 8 }), 'later'), false)
  assert.equal(h.queue.size, 1); assert.match(h.states.at(-1).message, /full/)
})
test('terminal retries use the same revision despite later heartbeat; terminal race reconciles matching server data', async () => {
  const terminal = snapshot({ state: 'ended' })
  const h = harness(() => ({ status: 409, body: { error: { code: 'session_ended' }, session: stored(terminal) } }))
  h.queue.enqueue(device, terminal, 'first'); h.queue.enqueue(device, { ...terminal, sequence: 182 }, 'later')
  await h.queue.flush()
  assert.equal(h.calls.find(c => c.method === 'PUT').body.snapshot.sequence, 181); assert.equal(h.queue.size, 0)
})
test('reload skips a redundant terminal upload only for same key and exact counters', async () => {
  const terminal = snapshot({ state: 'ended' }); const calls = []
  const h = harness(success, { request: async (path, options) => {
    calls.push(options.method)
    return { status: 200, body: options.method === 'GET' ? { session: stored(terminal) } : {} }
  } })
  h.queue.enqueue(device, { ...terminal, sequence: 182 }, 'now'); await h.queue.flush()
  assert.deepEqual(calls, ['POST', 'GET']); assert.equal(h.queue.size, 0)
})
test('terminal conflict with different counters remains pending and blocked', async () => {
  const h = harness(() => ({ status: 409, body: { error: { code: 'session_ended' }, session: stored(snapshot({ state: 'ended', tracked_seconds: 181 })) } }))
  h.queue.enqueue(device, snapshot({ state: 'ended' }), 'first'); await h.queue.flush()
  assert.equal(h.queue.size, 1); assert.equal(h.queue.pending.values().next().value.blocked, true)
})
test('expired authentication pauses without discarding; disposal ignores a late success', async () => {
  const h = harness(() => ({ status: 401, body: {} }))
  h.queue.enqueue(device, snapshot(), 'first'); h.tick(1000); await h.queue.flush()
  assert.equal(h.queue.paused, true); assert.equal(h.queue.size, 1)
  const gate = deferred(); const late = harness((p,o) => gate.promise.then(() => success(p,o)))
  late.queue.enqueue(device, snapshot(), 'first'); late.tick(1000)
  const promise = late.queue.flush(); await new Promise(setImmediate); late.queue.dispose(); gate.resolve(); await promise
  assert.equal(late.saved.length, 0)
})
test('unavailable device registration halts before any snapshot write', async () => {
  const calls = []
  const h = harness(success, { request: async (_, opts) => { calls.push(opts.method); return { status: 404, body: { error: { code: 'device_not_found' } } } } })
  h.queue.enqueue(device, snapshot(), 'first'); h.tick(1000); await h.queue.flush()
  assert.deepEqual(calls, ['POST']); assert.equal(h.queue.size, 1); assert.match(h.states.at(-1).message, /unavailable for this account/)
})
test('terminal liveness ignores repeated or older heartbeats while preserving the first terminal payload', () => {
  const book = new SessionBook()
  book.accept(device, snapshot({ state: 'ended' }), 'first')
  book.accept(device, snapshot({ state: 'ended', sequence: 190 }), 'second')
  assert.equal(book.accept(device, snapshot({ state: 'ended', sequence: 190 }), 'third').fresh, false)
  assert.equal(book.accept(device, snapshot({ state: 'ended', sequence: 189 }), 'fourth').fresh, false)
})
test('blocked registration and authentication messages remain visible as new heartbeats arrive', async () => {
  const h = harness(success, { request: async () => ({ status: 404, body: { error: { code: 'device_not_found' } } }) })
  h.queue.enqueue(device, snapshot(), 'first'); h.tick(1000); await h.queue.flush()
  h.queue.enqueue(device, snapshot({ sequence: 182 }), 'later')
  assert.match(h.states.at(-1).message, /unavailable for this account/)
  h.queue.pause('Sign in again'); h.queue.enqueue(device, snapshot({ sequence: 183 }), 'later')
  assert.equal(h.states.at(-1).message, 'Sign in again')
})

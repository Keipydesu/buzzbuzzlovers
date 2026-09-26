import test from 'node:test'
import assert from 'node:assert/strict'
import { BluetoothTransport, SERVICE_UUID, IDENTITY_UUID } from '../../app/javascript/ble/bluetooth_transport.js'
function setup() {
  const snapshots = [], statuses = [], events = new Map(), calls = []
  const bytes = new DataView(new ArrayBuffer(20)); const id = new DataView(new ArrayBuffer(16))
  const characteristic = {
    addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type),
    startNotifications: async () => { calls.push('subscribe'); events.get('characteristicvaluechanged')({ target: { value: bytes } }) },
    readValue: async () => { calls.push('read'); return bytes }
  }
  const device = {
    addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type),
    gatt: { disconnect: () => { calls.push('disconnect') }, connect: async () => ({ getPrimaryService: async uuid => {
      assert.equal(uuid, SERVICE_UUID)
      return { getCharacteristic: async uuid => uuid === IDENTITY_UUID ? { readValue: async () => id } : characteristic }
    } }) }
  }
  const transport = new BluetoothTransport({ onIdentity: value => { assert.equal(value, id); calls.push('identity') }, onSnapshot: v => snapshots.push(v), onStatus: s => statuses.push(s), secure: true,
    bluetooth: { requestDevice: async options => { assert.equal(options.filters[0].services[0], SERVICE_UUID); return device } } })
  return { transport, snapshots, statuses, events, calls, characteristic, bytes }
}
test('subscribes before read; identity precedes notifications; late callbacks after disconnect are ignored', async () => {
  const h = setup(); await h.transport.connect()
  assert.deepEqual(h.calls, ['identity','subscribe','read']); assert.equal(h.snapshots.length, 2)
  const late = h.events.get('characteristicvaluechanged')
  h.transport.disconnect(); late({ target: { value: h.bytes } })
  assert.equal(h.snapshots.length, 2); assert.equal(h.statuses.at(-1), 'disconnected')
})
test('resume reads are serialized and replaced-connection read result is ignored', async () => {
  const h = setup(); await h.transport.connect()
  let resolve; let reads = 0
  h.characteristic.readValue = () => { reads++; return new Promise(r => { resolve = r }) }
  const first = h.transport.read(); const second = h.transport.read()
  await new Promise(setImmediate); assert.equal(reads, 1)
  h.transport.disconnect(); resolve(h.bytes); await Promise.all([first, second])
  assert.equal(h.snapshots.length, 2); assert.equal(reads, 1)
})
test('unsupported browser never invokes discovery', async () => {
  const statuses = []
  const transport = new BluetoothTransport({ secure: false, onStatus: s => statuses.push(s), bluetooth: { requestDevice: () => assert.fail() } })
  await transport.connect(); assert.deepEqual(statuses, ['unsupported'])
})
test('a hung read on an old connection does not block a new connection read', async () => {
  const h = setup(); await h.transport.connect()
  const original = h.characteristic.readValue
  let finish
  h.characteristic.readValue = () => new Promise(resolve => { finish = resolve })
  const old = h.transport.read(); await new Promise(setImmediate)
  h.transport.disconnect(); h.characteristic.readValue = original
  let connected = false
  const next = h.transport.connect().then(() => { connected = true })
  await new Promise(setImmediate)
  const result = connected
  finish(h.bytes); await old; await next
  assert.equal(result, true)
})

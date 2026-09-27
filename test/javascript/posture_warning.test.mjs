import test from 'node:test'
import assert from 'node:assert/strict'
import { PostureWarning } from '../../app/javascript/ble/posture_warning.js'
function packet(phase, elapsed, sequence = 1, episode = 0) {
  const v = new DataView(new ArrayBuffer(14))
  v.setUint8(0, 1); v.setUint8(1, phase); v.setUint32(2, 7, true)
  v.setUint32(6, sequence, true); v.setUint16(10, elapsed, true); v.setUint16(12, episode, true)
  return v
}
test('device candidate fades to full at seven seconds; only confirmed qualification shakes once', () => {
  const w = new PostureWarning()
  w.accept(packet(1, 3500), 0)
  assert.equal(w.display(0).opacity, 0.5)
  w.accept(packet(1, 6000, 2), 2000)
  assert.equal(w.display(3000).opacity, 1)
  assert.equal(w.display(4000).shake, false)
  w.accept(packet(2, 10000, 3, 1), 4000)
  assert.equal(w.display(4000).shake, true)
  assert.equal(w.display(4001).shake, false)
  w.accept(packet(3, 0, 4, 1), 5000)
  assert.equal(w.display(6500).opacity, 0.5)
  assert.equal(w.display(8000).opacity, 0)
  w.accept(packet(2, 10000, 5, 1), 8100)
  assert.equal(w.display(8100).shake, false)
  w.accept(packet(2, 10000, 6, 2), 8200)
  assert.equal(w.display(8200).shake, true)
})
test('stale, out of order and malformed warning data do not revive a warning', () => {
  const w = new PostureWarning()
  w.accept(packet(1, 5000, 4), 0)
  assert.equal(w.accept(packet(2, 10000, 3), 2000), false)
  assert.equal(w.accept(packet(1, 5000, 4), 2000), false)
  assert.equal(w.display(3001).opacity, 0)
  assert.equal(w.accept(packet(3, 3001, 5), 4000), false)
  assert.equal(w.accept(new DataView(new ArrayBuffer(20)), 4000), false)
  w.accept(packet(0, 0, 5), 4000)
  assert.equal(w.display(4000).opacity, 0)
})

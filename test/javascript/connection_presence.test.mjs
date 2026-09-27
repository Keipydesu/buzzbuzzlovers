import test from 'node:test'
import assert from 'node:assert/strict'
import { ConnectionPresence } from '../../app/javascript/ble/connection_presence.js'

class Channel {
  static channels = new Set()
  constructor(name) { this.name = name; Channel.channels.add(this) }
  postMessage(data) {
    for (const peer of Channel.channels) {
      if (peer !== this && peer.name === this.name) peer.onmessage?.({ data })
    }
  }
  close() { Channel.channels.delete(this) }
}

test('live connection is discovered across tabs, isolated by account, and removed on disconnect', () => {
  const wearable = new ConnectionPresence('alice', () => {}, { Channel })
  wearable.setConnected(true)
  let alice, bob
  const dashboard = new ConnectionPresence('alice', value => { alice = value }, { Channel })
  const otherAccount = new ConnectionPresence('bob', value => { bob = value }, { Channel })
  assert.equal(alice, true)
  assert.equal(bob, false)
  wearable.setConnected(false)
  assert.equal(alice, false)
  wearable.setConnected(true)
  assert.equal(alice, true)
  wearable.close()
  assert.equal(alice, false)
  dashboard.close(); otherAccount.close()
})

test('a crashed tab expires and another disconnected tab does not hide a live connection', () => {
  let time = 0, connected
  const options = { Channel, now: () => time }
  const wearable = new ConnectionPresence('alice', () => {}, options)
  const idle = new ConnectionPresence('alice', () => {}, options)
  const dashboard = new ConnectionPresence('alice', value => { connected = value }, options)
  wearable.setConnected(true)
  idle.close()
  assert.equal(connected, true)
  wearable.channel.close()
  time = 15001
  dashboard.check()
  assert.equal(connected, false)
  dashboard.close()
})

test('unavailable cross-tab messaging leaves the connect card available', () => {
  let connected
  const presence = new ConnectionPresence('alice', value => { connected = value }, { Channel: null })
  assert.equal(connected, false)
  presence.close()
})

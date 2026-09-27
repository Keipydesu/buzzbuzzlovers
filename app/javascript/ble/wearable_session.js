import { decodeIdentity, decodeSnapshot, SessionBook, UploadQueue } from "ble/core"
import { BluetoothTransport } from "ble/bluetooth_transport"
import { FixtureTransport } from "ble/fixture_transport"
import { currentAccount, publishAccount } from "ble/account_context"
import { PostureWarning } from "ble/posture_warning"
import { ConnectionPresence } from "ble/connection_presence"

// Module lifetime survives Turbo page changes; DOM controllers only observe it.
const sessions = new Map()
export function currentSession(account) { return sessions.get(account) }
export function wearableSession(account, options) {
  let session = sessions.get(account)
  if (!session?.active) { session = new WearableSession(account, options); sessions.set(account, session) }
  return session
}

class WearableSession {
  constructor(account, { fixture = false, fixtureDevice, observedAt } = {}) {
    this.accountValue = account; this.fixtureValue = fixture; this.observedAtValue = observedAt
    this.listeners = new Set(); this.active = true; this.accountChanged = false; this.capacityError = false
    this.lifecycle = new AbortController(); this.book = new SessionBook(); this.deviceId = null
    this.warning = new PostureWarning()
    this.lastReading = null; this.lastFresh = null; this.link = "disconnected"
    this.details = "Press BOOT on the wearable while sitting upright to start or recalibrate."
    this.presence = new ConnectionPresence(account)
    this.queue = new UploadQueue({ request: this.request.bind(this),
      onChange: state => { this.savingState = state; this.notify() },
      onSaved: () => { this.lastSaved = performance.now(); this.notify("saved"); this.presence.saved() }
    })
    const callbacks = {
      onIdentity: value => {
        const identity = decodeIdentity(value)
        if (identity !== this.deviceId) {
          this.lastReading = null; this.lastFresh = null
          this.details = "Waiting for a reading from this wearable."
        }
        this.deviceId = identity; this.notify()
      },
      onWarning: value => { if (this.isCurrent() && this.warning.accept(value, performance.now())) this.notify() },
      onSnapshot: value => this.receive(value), onStatus: (status, message) => this.status(status, message)
    }
    this.transport = fixture ? new FixtureTransport({ ...callbacks, deviceId: fixtureDevice }) : new BluetoothTransport(callbacks)
    if (fixture) window.__bblFixture = this.transport
    this.status(this.transport.supported ? "disconnected" : "unsupported")
    this.queue.emit()
    this.listen(document, "visibilitychange", () => this.resume())
    this.listen(window, "pagehide", () => this.stop())
    this.listen(window, "beforeunload", event => { if (this.hasUnsaved()) { event.preventDefault(); event.returnValue = "" } })
    this.listen(document, "turbo:before-visit", event => {
      if (new URL(event.detail.url, location.href).origin === location.origin) return
      if (!this.allowLeaving()) event.preventDefault()
      else this.stop()
    })
    this.listen(document, "submit", event => {
      if (new URL(event.target.action, location.href).pathname !== "/logout") return
      if (!this.allowLeaving()) { event.preventDefault(); event.stopImmediatePropagation() }
      else this.stop()
    }, true)
    this.listen(document, "bbl:account", event => {
      if (event.detail !== this.accountValue) this.pauseForAccount()
      else if (this.accountChanged) {
        this.accountChanged = false
        this.status("disconnected", "Account restored. Reconnect or retry pending saves.")
        this.queue.emit()
      }
    })
    publishAccount()
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  notify(type = "change") { for (const listener of this.listeners) listener(type) }
  listen(target, name, callback, capture = false) {
    target.addEventListener(name, callback, { capture, signal: this.lifecycle.signal })
  }
  stop() {
    if (!this.active) return
    clearTimeout(this.calibrationTimer)
    this.active = false; this.link = "disconnected"
    this.transport.disconnect(false); this.queue.dispose(); this.lifecycle.abort(); this.presence.close()
    if (window.__bblFixture === this.transport) delete window.__bblFixture
    this.notify()
  }
  hasUnsaved() { return this.queue.size > 0 || this.capacityError }
  allowLeaving() {
    return !this.hasUnsaved() || window.confirm("Some wearable readings are not saved. Leaving discards them. Leave anyway?")
  }
  isCurrent() {
    const published = currentAccount()
    return this.active && !this.accountChanged && document.body.dataset.bblAccount === this.accountValue && (published === null || published === this.accountValue)
  }
  pauseForAccount() {
    if (!this.active || this.accountChanged) return
    this.accountChanged = true; this.transport.disconnect()
    this.queue.pause("Account changed. Saving paused. Return to the original account to retry.")
  }
  async connectWearable() {
    if (!this.isCurrent()) { this.pauseForAccount(); return }
    this.lastFresh = null; this.warning = new PostureWarning()
    await this.transport.connect()
  }
  async calibrate() {
    if (!this.isCurrent() || this.link !== "connected" || this.calibrationPending || this.lastReading?.state === "calibrating") return
    const attempt = this.calibrationAttempt = {}
    this.calibrationPending = true; this.linkMessage = null; this.notify()
    this.calibrationTimer = setTimeout(() => {
      this.calibrationPending = false
      this.linkMessage = "Calibration not confirmed. Try again or press BOOT."
      this.notify()
    }, 5000)
    try { await this.transport.calibrate() }
    catch (error) {
      if (this.calibrationAttempt !== attempt || !this.isCurrent()) return
      clearTimeout(this.calibrationTimer); this.calibrationPending = false
      this.linkMessage = error.message; this.notify()
    }
  }
  disconnectWearable() { this.transport.disconnect() }
  retrySaving() {
    if (!this.isCurrent()) { this.pauseForAccount(); return }
    this.queue.retry()
  }
  status(status, message) {
    if (!this.active) return
    if (status !== "connected") { this.calibrationAttempt = null; clearTimeout(this.calibrationTimer); this.calibrationPending = false }
    this.link = status; this.linkMessage = message
    this.presence.setConnected(status === "connected" && !this.accountChanged)
    this.notify()
  }
  receive(value) {
    if (!this.isCurrent() || !this.deviceId) return
    try {
      const reading = decodeSnapshot(value)
      const observedAt = this.fixtureValue ? this.observedAtValue : new Date().toISOString()
      const result = this.book.accept(this.deviceId, reading, observedAt)
      if (result.display && result.fresh) {
        if (result.snapshot.state === "calibrating") { clearTimeout(this.calibrationTimer); this.calibrationPending = false }
        this.lastFresh = performance.now(); this.lastReading = result.snapshot; this.linkMessage = null
        const s = result.snapshot
        this.details = s.session_id === 0 ? "No session yet. Press BOOT while upright to calibrate."
          : `Session ${s.session_id} · ${s.episode_count} episodes · ${(s.tracked_seconds / 60).toFixed(1)} min tracked · ${(s.slouch_seconds / 60).toFixed(1)} min slouching`
        this.notify()
      }
      if (result.upload && !this.queue.enqueue(this.deviceId, result.snapshot, result.firstObservedAt)) {
        this.capacityError = true; this.queue.emit()
      }
    } catch (error) {
      this.queue.pause(error.message); this.transport.disconnect()
    }
  }
  async resume() {
    if (!this.active || document.hidden || this.link !== "connected") return
    this.lastFresh = null; this.warning.receivedAt = -Infinity; this.notify()
    try { await this.transport.read() } catch { this.status("connected", "Bluetooth reading failed. Disconnect and reconnect the wearable.") }
  }
  async request(path, { method = "GET", body, signal } = {}) {
    const unauthorized = () => ({ status: 401, body: { error: { code: "account_changed", message: "Account changed. Saving paused." } } })
    if (!this.isCurrent()) return unauthorized()
    const controller = new AbortController()
    const abort = () => controller.abort()
    const signals = [this.lifecycle.signal, signal].filter(Boolean)
    for (const source of signals) { if (source.aborted) abort(); else source.addEventListener("abort", abort, { once: true }) }
    const timeout = setTimeout(abort, 10000)
    try {
      const response = await fetch(path, {
        method, credentials: "same-origin", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
      let payload = null
      if (response.headers.get("content-type")?.includes("application/json")) {
        try { payload = await response.json() } catch { /* Malformed responses are handled as failed saves. */ }
      }
      if (!this.isCurrent()) return unauthorized()
      return { status: response.ok && !payload ? 502 : response.status, body: payload, retryAfter: response.headers.get("retry-after") }
    } finally {
      clearTimeout(timeout); for (const source of signals) source.removeEventListener("abort", abort)
    }
  }
}

import { Controller } from "@hotwired/stimulus"
import { decodeIdentity, decodeSnapshot, SessionBook, UploadQueue } from "ble/core"
import { BluetoothTransport } from "ble/bluetooth_transport"
import { FixtureTransport } from "ble/fixture_transport"
import { currentAccount, publishAccount } from "ble/account_context"

export default class extends Controller {
  static values = { account: String, fixture: Boolean, fixtureDevice: String, observedAt: String }
  static targets = ["connection", "posture", "saving", "details", "connectButton", "disconnectButton", "retryButton", "identity",
    "todayEpisodes", "todayTracked", "todaySlouch", "empty", "incomplete", "history", "summaryStatus"]

  connect() {
    this.active = true; this.accountChanged = false; this.capacityError = false
    this.lifecycle = new AbortController(); this.book = new SessionBook(); this.deviceId = null
    this.lastReading = null; this.lastFresh = null; this.link = "disconnected"
    this.queue = new UploadQueue({ request: this.request.bind(this), onChange: state => this.renderSaving(state), onSaved: () => this.scheduleSummary() })
    const callbacks = {
      onIdentity: value => {
        const identity = decodeIdentity(value)
        if (identity !== this.deviceId) {
          this.lastReading = null; this.lastFresh = null
          this.postureTarget.textContent = "No live reading"
          this.detailsTarget.textContent = "Waiting for a reading from this wearable."
        }
        this.deviceId = identity; this.identityTarget.textContent = `Device ${identity}`
      },
      onSnapshot: value => this.receive(value), onStatus: (status, message) => this.status(status, message)
    }
    this.transport = this.fixtureValue
      ? new FixtureTransport({ ...callbacks, deviceId: this.fixtureDeviceValue })
      : new BluetoothTransport(callbacks)
    // Only the isolated test server renders the fixture opt-in and visible banner.
    if (this.fixtureValue) window.__bblFixture = this.transport
    this.postureTarget.textContent = "No live reading"
    this.detailsTarget.textContent = "Press BOOT on the wearable while sitting upright to start or recalibrate."
    this.identityTarget.textContent = "No wearable selected"
    this.status(this.transport.supported ? "disconnected" : "unsupported")
    this.queue.emit()
    this.listen(document, "visibilitychange", () => this.resume())
    this.listen(window, "pageshow", event => { if (event.persisted) this.resume() })
    this.listen(window, "pagehide", () => this.stop())
    this.listen(window, "beforeunload", event => { if (this.hasUnsaved()) { event.preventDefault(); event.returnValue = "" } })
    this.listen(document, "turbo:before-visit", event => {
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
        this.status("disconnected", "Original account restored. Reconnect the wearable or retry pending saves.")
        this.queue.emit()
      }
    })
    publishAccount()
    this.freshnessTimer = setInterval(() => this.renderConnection(), 500)
  }
  listen(target, name, callback, capture = false) {
    target.addEventListener(name, callback, { capture, signal: this.lifecycle.signal })
  }
  disconnect() {
    this.stop()
    if (this.fixtureValue && window.__bblFixture === this.transport) delete window.__bblFixture
  }
  stop() {
    if (!this.active) return
    this.active = false; this.transport.disconnect(false); this.queue.dispose(); this.lifecycle.abort()
    clearInterval(this.freshnessTimer); clearTimeout(this.summaryTimer)
  }
  hasUnsaved() { return this.queue.size > 0 || this.capacityError }
  allowLeaving() {
    return !this.hasUnsaved() || window.confirm("Some wearable readings are not saved. Leaving this page discards them. Leave anyway?")
  }
  isCurrent() {
    const published = currentAccount()
    return this.active && !this.accountChanged && document.body.dataset.bblAccount === this.accountValue && (published === null || published === this.accountValue)
  }
  pauseForAccount() {
    if (!this.active || this.accountChanged) return
    this.accountChanged = true; this.transport.disconnect()
    this.queue.pause("Account changed in another page. Unsaved readings remain paused. Return to this account before leaving or discard them on navigation.")
    this.connectButtonTarget.disabled = true; this.retryButtonTarget.disabled = true
  }
  async connectWearable() {
    if (!this.isCurrent()) { this.pauseForAccount(); return }
    this.lastFresh = null
    await this.transport.connect()
  }
  disconnectWearable() { this.transport.disconnect() }
  retrySaving() {
    if (!this.isCurrent()) { this.pauseForAccount(); return }
    this.queue.retry()
  }
  status(status, message) {
    if (!this.active) return
    this.link = status; this.linkMessage = message
    this.connectButtonTarget.disabled = !this.transport?.supported || status === "connecting" || this.accountChanged
    this.disconnectButtonTarget.disabled = !["connecting", "connected"].includes(status)
    this.renderConnection()
  }
  renderConnection() {
    if (!this.active) return
    const stale = this.link === "connected" && (this.lastFresh === null || performance.now() - this.lastFresh > 3000)
    const labels = { unsupported: "Bluetooth unavailable in this browser. Saved history is still available.", disconnected: "Bluetooth disconnected", connecting: "Connecting to wearable…", connected: stale ? "Bluetooth connected · readings stale or not yet received" : "Bluetooth connected · receiving readings" }
    this.connectionTarget.textContent = this.linkMessage || labels[this.link]
    if (this.lastReading) this.postureTarget.textContent = `${this.postureLabel(this.lastReading.state)}${this.link !== "connected" || stale ? " (last received)" : ""}`
  }
  postureLabel(state) {
    return { idle: "Ready to calibrate", calibrating: "Calibrating", upright: "Non-slouch posture", slouching: "Slouching", sensor_error: "Sensor error", ended: "Session ended" }[state]
  }
  receive(value) {
    if (!this.isCurrent() || !this.deviceId) return
    try {
      const reading = decodeSnapshot(value)
      const observedAt = this.fixtureValue ? this.observedAtValue : new Date().toISOString()
      const result = this.book.accept(this.deviceId, reading, observedAt)
      if (result.display && result.fresh) {
        this.lastFresh = performance.now(); this.lastReading = result.snapshot; this.linkMessage = null
        const s = result.snapshot
        this.detailsTarget.textContent = s.session_id === 0 ? "No session yet. Press BOOT while upright to calibrate."
          : `Session ${s.session_id} · ${s.episode_count} episodes · ${(s.tracked_seconds / 60).toFixed(1)} min tracked · ${(s.slouch_seconds / 60).toFixed(1)} min slouching`
        this.renderConnection()
      }
      if (result.upload && !this.queue.enqueue(this.deviceId, result.snapshot, result.firstObservedAt)) {
        this.capacityError = true; this.queue.emit()
      }
    } catch (error) {
      this.queue.pause(error.message)
      this.transport.disconnect()
      this.postureTarget.textContent = "Wearable data error"
    }
  }
  renderSaving(state) {
    if (!this.active) return
    this.savingTarget.textContent = `${state.message}${state.pending ? ` ${state.pending} session(s) pending.` : ""}${this.capacityError ? " Some readings could not be queued because capacity was exceeded." : ""}`
    this.retryButtonTarget.hidden = !state.pending
    this.retryButtonTarget.disabled = state.saving || this.accountChanged
  }
  async resume() {
    if (!this.active || document.hidden || this.link !== "connected") return
    this.lastFresh = null; this.renderConnection()
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
  scheduleSummary() {
    this.summaryDirty = true
    if (this.summaryTimer || this.refreshing || !this.active) return
    this.summaryTimer = setTimeout(() => { this.summaryTimer = null; void this.refreshSummary() }, 1000)
  }
  async refreshSummary() {
    if (!this.isCurrent()) return
    this.refreshing = true; this.summaryDirty = false
    try {
      const today = await this.request("/api/v1/today")
      const weekly = await this.request("/api/v1/weekly")
      if (!this.isCurrent()) return
      if (today.status !== 200 || weekly.status !== 200) throw new Error("Summary unavailable")
      const summary = today.body.summary
      this.todayEpisodesTarget.textContent = summary.episode_count
      this.todayTrackedTarget.textContent = (summary.tracked_seconds / 60).toFixed(1)
      this.todaySlouchTarget.textContent = (summary.slouch_seconds / 60).toFixed(1)
      this.emptyTarget.hidden = summary.session_count !== 0
      this.incompleteTarget.textContent = summary.incomplete_session_count ? `${summary.incomplete_session_count} unfinished sessions included.` : ""
      const rows = weekly.body.days.map(day => {
        const row = document.createElement("tr"), heading = document.createElement("th")
        heading.scope = "row"; heading.textContent = new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" }); row.append(heading)
        if (day.summary.session_count === 0) {
          const cell = document.createElement("td"); cell.colSpan = 2; cell.textContent = "No data"; row.append(cell)
        } else for (const field of ["tracked_seconds", "slouch_seconds"]) {
          const cell = document.createElement("td"); cell.textContent = (day.summary[field] / 60).toFixed(1); row.append(cell)
        }
        return row
      })
      this.historyTarget.replaceChildren(...rows)
      this.summaryStatusTarget.textContent = "Saved totals refreshed. Group rankings refresh when you open the leaderboard."
    } catch {
      if (this.active) this.summaryStatusTarget.textContent = "Saved summary could not refresh. Reload after pending readings are saved."
    } finally {
      this.refreshing = false
      if (this.summaryDirty && this.active) this.scheduleSummary()
    }
  }
}

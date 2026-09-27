import { Controller } from "@hotwired/stimulus"
import { wearableSession } from "ble/wearable_session"

export default class extends Controller {
  static values = { account: String, fixture: Boolean, fixtureDevice: String, observedAt: String }
  static targets = ["connection", "posture", "saving", "details", "connectButton", "disconnectButton", "retryButton", "identity",
    "connectStep", "calibrateStep", "trackingStep", "progress", "setupPanel", "stage", "calibrationHint", "readyStep", "dashboardButton", "calibrateButton"]

  connect() {
    this.session = wearableSession(this.accountValue, { fixture: this.fixtureValue, fixtureDevice: this.fixtureDeviceValue, observedAt: this.observedAtValue })
    this.unsubscribe = this.session.subscribe(type => {
      if (type === "saved") { clearTimeout(this.savingNoticeTimer); this.savingNoticeTimer = null; this.savingStalled = false }
      this.refresh()
    })
    this.refresh()
    this.freshnessTimer = setInterval(() => this.refresh(), 500)
  }
  disconnect() {
    this.unsubscribe?.()
    clearInterval(this.freshnessTimer); clearTimeout(this.savingNoticeTimer)
  }
  refresh() {
    for (const key of ["active", "accountChanged", "capacityError", "lastReading", "lastFresh", "link", "linkMessage"]) this[key] = this.session[key]
    this.connectButtonTarget.disabled = !this.session.transport.supported || this.link === "connecting" || this.accountChanged
    this.disconnectButtonTarget.disabled = !["connecting", "connected"].includes(this.link)
    this.disconnectButtonTarget.hidden = !["connecting", "connected"].includes(this.link)
    this.setText(this.identityTarget, this.session.deviceId ? `Device ${this.session.deviceId}` : "No wearable selected")
    this.setText(this.detailsTarget, this.session.details)
    if (!this.lastReading) this.setText(this.postureTarget, "No live reading")
    this.renderConnection()
    if (this.session.savingState) this.renderSaving(this.session.savingState)
  }
  connectWearable() { return this.session.connectWearable() }
  disconnectWearable() { this.session.disconnectWearable() }
  calibrate() { return this.session.calibrate() }
  retrySaving() { this.session.retrySaving() }
  renderConnection() {
    if (!this.active) return
    const stale = this.link === "connected" && (this.lastFresh === null || performance.now() - this.lastFresh > 3000)
    const connected = this.link === "connected"
    const tracking = !this.session.calibrationPending && connected && this.lastFresh !== null && ["upright", "slouching"].includes(this.lastReading?.state)
    this.connectStepTarget.hidden = connected
    this.calibrateStepTarget.hidden = !connected || tracking
    this.trackingStepTarget.hidden = !connected
    this.readyStepTarget.hidden = !tracking
    this.dashboardButtonTarget.hidden = !tracking
    this.postureTarget.hidden = !this.lastReading
    const canCalibrate = this.session.transport.canCalibrate
    const calibrating = this.lastReading?.state === "calibrating"
    this.calibrateButtonTarget.hidden = !connected
    this.calibrateButtonTarget.disabled = !canCalibrate || calibrating || this.session.calibrationPending || this.accountChanged || this.lastReading?.state === "ended"
    this.setText(this.calibrateButtonTarget, this.session.calibrationPending ? "Starting…" : calibrating ? "Calibrating…" : tracking ? "Recalibrate" : "Calibrate")
    this.calibrationHintTarget.textContent = this.session.calibrationPending ? "Sit upright. Waiting for wearable…" : this.lastFresh !== null && this.lastReading?.state === "calibrating"
      ? "Hold still. Calibrating…" : canCalibrate ? "Sit upright. Tap Calibrate. Hold still." : "Press BOOT to calibrate. Software calibration needs a firmware update."
    const step = tracking ? 2 : connected ? 1 : 0
    this.progressTarget.setAttribute("aria-valuenow", step)
    this.progressTarget.setAttribute("aria-valuetext", ["Connect your wearable", "Connected. Calibrate your posture", "Connected and calibrated"][step])
    this.setupPanelTarget.dataset.setupStep = step
    this.stageTargets.forEach((stage, index) => {
      stage.classList.toggle("is-complete", index < step)
      if (index === step) stage.setAttribute("aria-current", "step")
      else stage.removeAttribute("aria-current")
    })
    const labels = { unsupported: "Bluetooth unavailable in this browser.", disconnected: "Bluetooth disconnected", connecting: "Connecting…", connected: stale && this.lastFresh !== null ? "Signal paused · last reading shown" : "Connected" }
    this.setText(this.connectionTarget, this.linkMessage || labels[this.link])
    this.connectionTarget.classList.toggle("is-quiet", !this.linkMessage && (this.link === "disconnected" || (connected && (!stale || this.lastFresh === null))))
    if (this.lastReading) this.setText(this.postureTarget, `${this.postureLabel(this.lastReading.state)}${this.link !== "connected" || stale ? " (last received)" : ""}`)
  }
  setText(element, text) { if (element.textContent !== text) element.textContent = text }
  postureLabel(state) {
    return { idle: "Ready to calibrate", calibrating: "Calibrating", upright: "Upright", slouching: "Slouching", sensor_error: "Sensor error", ended: "Session ended" }[state]
  }
  renderSaving(state) {
    if (!this.active) return
    this.lastSavingState = state
    if (state.pending && !this.savingNoticeTimer) {
      this.savingNoticeTimer = setTimeout(() => {
        this.savingStalled = true
        this.renderSaving(this.lastSavingState)
      }, 5000)
    } else if (!state.pending) {
      clearTimeout(this.savingNoticeTimer); this.savingNoticeTimer = null; this.savingStalled = false
    }
    const needsAttention = state.needsAttention || this.capacityError || this.savingStalled
    this.setText(this.savingTarget, `${state.message}${state.pending ? ` ${state.pending} session(s) pending.` : ""}${this.capacityError ? " Some readings could not be queued because capacity was exceeded." : ""}`)
    this.savingTarget.hidden = !needsAttention
    this.retryButtonTarget.hidden = !state.pending || !needsAttention
    this.retryButtonTarget.disabled = state.saving || this.accountChanged
  }
}

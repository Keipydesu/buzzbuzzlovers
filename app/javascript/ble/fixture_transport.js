// Used only by the explicitly labeled, server-gated isolated E2E dashboard.
export class FixtureTransport {
  constructor({ onIdentity, onSnapshot, onWarning, onStatus, deviceId }) {
    Object.assign(this, { onIdentity, onSnapshot, onWarning, onStatus, deviceId })
    this.connected = false; this.last = null
  }
  get canCalibrate() { return this.connected }
  async calibrate() {
    if (!this.connected) throw new Error("Wearable disconnected")
    const last = this.last
    this.emit({ state: "calibrating", session_id: last?.getUint32(2, true) || 7,
      sequence: (last?.getUint32(6, true) || 0) + 1, tracked_seconds: last?.getUint32(10, true) || 0,
      slouch_seconds: last?.getUint32(14, true) || 0, episode_count: last?.getUint16(18, true) || 0 })
  }
  get supported() { return true }
  async connect() {
    this.connected = true; this.onStatus("connecting")
    const identity = Uint8Array.from(this.deviceId.match(/../g), hex => parseInt(hex, 16))
    this.onIdentity(new DataView(identity.buffer)); this.onStatus("connected")
    if (this.last) this.onSnapshot(this.last)
  }
  emit(reading) {
    const states = ["idle", "calibrating", "upright", "slouching", "sensor_error", "ended"]
    const view = new DataView(new ArrayBuffer(20))
    view.setUint8(0, reading.protocol_version ?? 1)
    view.setUint8(1, states.indexOf(reading.state ?? "slouching"))
    view.setUint32(2, reading.session_id ?? 7, true); view.setUint32(6, reading.sequence ?? 181, true)
    view.setUint32(10, reading.tracked_seconds ?? 180, true); view.setUint32(14, reading.slouch_seconds ?? 70, true)
    view.setUint16(18, reading.episode_count ?? 1, true)
    this.last = view
    if (this.connected) this.onSnapshot(view)
  }
  emitWarning({ phase = 0, elapsed = 0, session = 7, sequence = 1, episode = 0 } = {}) {
    const value = new DataView(new ArrayBuffer(14))
    value.setUint8(0, 1); value.setUint8(1, phase)
    value.setUint32(2, session, true); value.setUint32(6, sequence, true)
    value.setUint16(10, elapsed, true); value.setUint16(12, episode, true)
    if (this.connected) this.onWarning(value)
  }
  async read() { if (this.connected && this.last) this.onSnapshot(this.last) }
  disconnect(announce = true) { this.connected = false; if (announce) this.onStatus("disconnected") }
}

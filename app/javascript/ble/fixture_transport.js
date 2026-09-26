// Used only by the explicitly labeled, server-gated isolated E2E dashboard.
export class FixtureTransport {
  constructor({ onIdentity, onSnapshot, onStatus, deviceId }) {
    Object.assign(this, { onIdentity, onSnapshot, onStatus, deviceId })
    this.connected = false; this.last = null
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
  async read() { if (this.connected && this.last) this.onSnapshot(this.last) }
  disconnect(announce = true) { this.connected = false; if (announce) this.onStatus("disconnected") }
}

export const STATES = Object.freeze(["idle", "calibrating", "upright", "slouching", "sensor_error", "ended"])
export const FIELDS = Object.freeze(["protocol_version", "state", "sequence", "tracked_seconds", "slouch_seconds", "episode_count"])
const counters = ["tracked_seconds", "slouch_seconds", "episode_count"]
export const keyFor = (device, session) => `${device}/${session}`
export const snapshotBody = snapshot => Object.fromEntries(FIELDS.map(field => [field, snapshot[field]]))
export const sameValues = (a, b) => FIELDS.filter(field => field !== "sequence").every(field => a[field] === b[field])
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max

export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.protocol_version !== 1 || !STATES.includes(snapshot.state) ||
      !integer(snapshot.session_id, 0, 0xffffffff) || !integer(snapshot.sequence, 1, 0xffffffff) ||
      !integer(snapshot.tracked_seconds, 0, 0xffffffff) || !integer(snapshot.slouch_seconds, 0, snapshot.tracked_seconds) ||
      !integer(snapshot.episode_count, 0, 0xffff)) throw new Error("Invalid wearable snapshot. Saving stopped for this reading.")
  if (snapshot.session_id === 0 && (!["idle", "sensor_error"].includes(snapshot.state) || counters.some(field => snapshot[field] !== 0))) {
    throw new Error("Invalid pre-session snapshot.")
  }
  return Object.freeze({ session_id: snapshot.session_id, ...snapshotBody(snapshot) })
}

export function decodeIdentity(view) {
  if (!(view instanceof DataView) || view.byteLength !== 16) throw new Error("Wearable identity must contain 16 bytes.")
  return Array.from({ length: 16 }, (_, i) => view.getUint8(i).toString(16).padStart(2, "0")).join("")
}

export function decodeSnapshot(view) {
  if (!(view instanceof DataView) || view.byteLength !== 20) throw new Error("Wearable snapshot must contain 20 bytes.")
  return validateSnapshot({
    protocol_version: view.getUint8(0), state: STATES[view.getUint8(1)], session_id: view.getUint32(2, true),
    sequence: view.getUint32(6, true), tracked_seconds: view.getUint32(10, true),
    slouch_seconds: view.getUint32(14, true), episode_count: view.getUint16(18, true)
  })
}

// Connection generation is checked by the transport; ordering here is per device/session.
export class SessionBook {
  constructor() { this.sessions = new Map(); this.latest = new Map() }
  accept(device, reading, observedAt) {
    const snapshot = validateSnapshot(reading)
    if (!/^[0-9a-f]{32}$/.test(device)) throw new Error("Invalid wearable identity.")
    if (snapshot.session_id === 0) return { snapshot, display: true, fresh: true, upload: false }
    const key = keyFor(device, snapshot.session_id)
    const old = this.sessions.get(key)
    if (old) {
      if (snapshot.sequence < (old.lastSequence || old.snapshot.sequence)) return { ...old, display: false, fresh: false, upload: false }
      if (snapshot.sequence === (old.lastSequence || old.snapshot.sequence)) {
        if (!sameValues(snapshot, old.snapshot)) throw new Error("Conflicting wearable revision. Reconnect after checking the device.")
        return { ...old, display: false, fresh: false, upload: false }
      }
      if (old.snapshot.state === "ended") {
        if (!sameValues(snapshot, old.snapshot)) throw new Error("Wearable changed a completed session. Saving paused.")
        // Preserve the FIRST terminal revision for retries, while recognizing heartbeat liveness.
        old.lastSequence = snapshot.sequence
        return { ...old, display: snapshot.session_id === this.latest.get(device), fresh: true, upload: false }
      }
      if (counters.some(field => snapshot[field] < old.snapshot[field])) throw new Error("Wearable counters decreased. Saving paused.")
    }
    const entry = { snapshot, firstObservedAt: old?.firstObservedAt || observedAt }
    this.sessions.set(key, entry)
    this.latest.set(device, Math.max(this.latest.get(device) || 0, snapshot.session_id))
    return { ...entry, display: snapshot.session_id === this.latest.get(device), fresh: true, upload: true }
  }
}

export function storedCovers(entry, session, terminalOnly = false) {
  if (!session || session.device_id !== entry.deviceId || session.device_session_id !== entry.snapshot.session_id) return false
  const stored = session.snapshot
  if (!stored || stored.protocol_version !== entry.snapshot.protocol_version) return false
  if (terminalOnly) return session.ended === true && stored.state === "ended" && sameValues(stored, entry.snapshot)
  if (!integer(stored.sequence, entry.snapshot.sequence, 0xffffffff)) return false
  if (stored.sequence === entry.snapshot.sequence) return sameValues(stored, entry.snapshot)
  return counters.every(field => integer(stored[field], entry.snapshot[field], field === "episode_count" ? 0xffff : 0xffffffff))
}

export class UploadQueue {
  constructor({ request, onChange = () => {}, onSaved = () => {}, now = () => Date.now(), random = Math.random,
    setTimer = (callback, delay) => setTimeout(callback, delay), clearTimer = timer => clearTimeout(timer), interval = 1000, limit = 100 }) {
    Object.assign(this, { request, onChange, onSaved, now, random, setTimer, clearTimer, interval, limit })
    this.pending = new Map(); this.abort = new AbortController(); this.paused = false; this.closed = false
    this.inflight = false; this.message = "No pending saves."; this.timer = null
  }
  get size() { return this.pending.size }
  emit() {
    const blocked = [...this.pending.values()].find(entry => entry.blocked)
    const retrying = [...this.pending.values()].some(entry => entry.attempts > 0)
    const message = this.paused ? this.message : blocked?.error || (retrying ? "Saving unavailable. Unsaved readings will retry; keep this page open." : this.message)
    this.onChange({ pending: this.size, saving: this.inflight, paused: this.paused, needsAttention: this.paused || Boolean(blocked) || retrying, message })
  }
  enqueue(deviceId, snapshot, firstObservedAt) {
    if (this.closed) return false
    snapshot = validateSnapshot(snapshot)
    if (!snapshot.session_id) return true
    const key = keyFor(deviceId, snapshot.session_id)
    const previous = this.pending.get(key)
    if (!previous && this.size >= this.limit) {
      this.message = "Unsaved queue is full. New sessions cannot be saved until space is available. Keep this page open."
      this.emit(); return false
    }
    if (previous) {
      if (snapshot.sequence <= previous.snapshot.sequence) return true
      if (previous.snapshot.state === "ended") {
        if (!sameValues(previous.snapshot, snapshot)) this.block(key, "Wearable changed a completed session.")
        return true
      }
      previous.snapshot = snapshot
    } else {
      this.pending.set(key, { deviceId, snapshot, firstObservedAt, readyAt: this.now() + (snapshot.state === "ended" ? 0 : this.interval), attempts: 0, prepared: false })
    }
    if (snapshot.state === "ended" && previous && previous.attempts === 0) previous.readyAt = this.now()
    if (!this.paused) this.message = "Unsaved readings — keep this page open."
    this.emit(); this.schedule(); return true
  }
  block(key, message) {
    const entry = this.pending.get(key)
    if (entry) { entry.blocked = true; entry.error = message }
    this.message = message; this.emit()
  }
  pause(message) { this.paused = true; this.clearTimer(this.timer); this.message = message; this.emit() }
  retry() {
    if (this.closed) return
    this.paused = false
    for (const entry of this.pending.values()) { entry.blocked = false; entry.error = null; entry.prepared = false; entry.readyAt = this.now(); entry.attempts = 0 }
    this.message = "Retrying saved readings…"; this.emit(); this.schedule()
  }
  dispose() { this.closed = true; this.clearTimer(this.timer); this.abort.abort() }
  schedule() {
    this.clearTimer(this.timer)
    if (this.closed || this.paused || this.inflight) return
    const entries = [...this.pending.values()].filter(entry => !entry.blocked)
    if (entries.length) this.timer = this.setTimer(() => { void this.flush() }, Math.max(0, Math.min(...entries.map(entry => entry.readyAt)) - this.now()))
  }
  async call(path, method = "GET", body) {
    const response = await this.request(path, { method, body, signal: this.abort.signal })
    if (this.closed) throw new Error("Queue closed")
    if (response.status < 200 || response.status >= 300) throw Object.assign(new Error(response.body?.error?.message || "Saving request failed."), { response })
    return response.body
  }
  async flush() {
    if (this.closed || this.paused || this.inflight) return
    this.clearTimer(this.timer)
    const choice = [...this.pending.entries()].filter(([, entry]) => !entry.blocked && entry.readyAt <= this.now())
      .sort((a, b) => Number(b[1].snapshot.state === "ended") - Number(a[1].snapshot.state === "ended"))[0]
    if (!choice) { this.schedule(); return }
    const [key, entry] = choice
    const sent = { ...entry, snapshot: entry.snapshot }
    const path = `/api/v1/devices/${entry.deviceId}`
    this.inflight = true; this.emit()
    try {
      if (!entry.prepared) {
        await this.call("/api/v1/devices", "POST", { device_id: entry.deviceId })
        const last = await this.call(`${path}/session`)
        entry.prepared = true
        if (storedCovers(sent, last.session, true)) { this.accept(key, sent, last.session); return }
      }
      const result = await this.call(`${path}/sessions/${sent.snapshot.session_id}/snapshot`, "PUT", {
        snapshot: snapshotBody(sent.snapshot), observation: { first_observed_at: sent.firstObservedAt }
      })
      if (!["accepted", "duplicate", "stale"].includes(result.disposition) || !storedCovers(sent, result.session)) {
        this.block(key, "Saved data conflicts with this wearable. Check the device before retrying."); return
      }
      this.accept(key, sent, result.session)
    } catch (error) {
      if (this.closed) return
      const response = error.response
      if (response?.status === 409 && response.body?.error?.code === "session_ended" && storedCovers(sent, response.body.session, true)) {
        this.accept(key, sent, response.body.session)
      } else if ([401, 403].includes(response?.status)) {
        this.pause("Saving paused. Sign in again as the same account; unsaved readings remain in this page.")
      } else if (!response || response.status === 429 || response.status >= 500) {
        const delays = [1000, 2000, 4000, 8000, 30000]
        const backoff = Math.min(30000, delays[Math.min(entry.attempts++, delays.length - 1)] * (1 + this.random() * 0.2))
        const retry = response?.retryAfter
        const retryMs = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - this.now()) || 0
        entry.readyAt = this.now() + Math.max(backoff, retryMs)
        this.message = "Saving unavailable. Unsaved readings will retry; keep this page open."
      } else {
        this.block(key, response.status === 404 && response.body?.error?.code === "device_not_found"
          ? "This wearable is unavailable for this account. Sign in with its original account or use another wearable."
          : `Saving stopped (${response.status}). ${response.body?.error?.message || "Check the request or device before retrying."}`)
      }
    } finally {
      this.inflight = false
      if (!this.closed) { this.emit(); this.schedule() }
    }
  }
  accept(key, sent, session) {
    const current = this.pending.get(key)
    if (current && (storedCovers(current, session) || storedCovers(current, session, true))) this.pending.delete(key)
    else if (current) { current.attempts = 0; current.readyAt = this.now() + (current.snapshot.state === "ended" ? 0 : this.interval) }
    this.message = this.size ? "Newer readings are still unsaved." : "Saved."
    this.onSaved(session)
  }
}

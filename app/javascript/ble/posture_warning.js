// Display-only timing supplied by the ESP32; never classify posture here.
export class PostureWarning {
  constructor() { this.reading = null; this.receivedAt = null; this.shaken = null; this.neutralFade = null }
  accept(value, now) {
    if (!(value instanceof DataView) || value.byteLength !== 14 || value.getUint8(0) !== 1) return false
    const phase = value.getUint8(1), elapsed = value.getUint16(10, true)
    if (phase > 3 || elapsed > (phase === 3 ? 3000 : 10000)) return false
    const reading = { phase, elapsed, session: value.getUint32(2, true), sequence: value.getUint32(6, true), episode: value.getUint16(12, true) }
    const old = this.reading
    if (old && (reading.session < old.session || (reading.session === old.session && reading.sequence <= old.sequence))) return false
    if (old?.session === reading.session && old.phase === 1 && reading.phase === 0) {
      this.neutralFade = { opacity: this.opacity(now), startedAt: now }
    } else if (reading.phase !== 0 || old?.session !== reading.session) {
      this.neutralFade = null
    }
    this.reading = reading; this.receivedAt = now
    return true
  }
  opacity(now) {
    const r = this.reading
    if (!r || now - this.receivedAt > 3000) return 0
    const elapsed = r.elapsed + Math.max(0, now - this.receivedAt)
    if (r.phase === 1) return Math.max(0, Math.min(1, (elapsed - 3000) / 4000))
    if (r.phase === 2) return 1
    if (r.phase === 3) return Math.max(0, 1 - elapsed / 3000)
    return this.neutralFade ? this.neutralFade.opacity * Math.max(0, 1 - (now - this.neutralFade.startedAt) / 3000) : 0
  }
  display(now) {
    const r = this.reading
    if (!r || now - this.receivedAt > 3000) return { opacity: 0, shake: false }
    const opacity = this.opacity(now)
    const key = `${r.session}:${r.episode}`
    const shake = r.phase === 2 && this.shaken !== key
    // Recovery is still the same episode; returning to leaning must not shake again.
    if (r.phase === 2 || r.phase === 3) this.shaken = key
    return { opacity, shake }
  }
}

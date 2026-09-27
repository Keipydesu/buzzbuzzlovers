// Display-only timing supplied by the ESP32; never classify posture here.
export class PostureWarning {
  constructor() { this.reading = null; this.receivedAt = null; this.shaken = null }
  accept(value, now) {
    if (!(value instanceof DataView) || value.byteLength !== 14 || value.getUint8(0) !== 1) return false
    const phase = value.getUint8(1), elapsed = value.getUint16(10, true)
    if (phase > 3 || elapsed > (phase === 3 ? 3000 : 10000)) return false
    const reading = { phase, elapsed, session: value.getUint32(2, true), sequence: value.getUint32(6, true), episode: value.getUint16(12, true) }
    const old = this.reading
    if (old && (reading.session < old.session || (reading.session === old.session && reading.sequence <= old.sequence))) return false
    this.reading = reading; this.receivedAt = now
    return true
  }
  display(now) {
    const r = this.reading
    if (!r || now - this.receivedAt > 3000) return { opacity: 0, shake: false }
    const elapsed = r.elapsed + Math.max(0, now - this.receivedAt)
    const opacity = r.phase === 1 ? Math.min(1, elapsed / 7000) : r.phase === 2 ? 1 : r.phase === 3 ? Math.max(0, 1 - elapsed / 3000) : 0
    const key = `${r.session}:${r.episode}`
    const shake = r.phase === 2 && this.shaken !== key
    // Recovery is still the same episode; returning to leaning must not shake again.
    if (r.phase === 2 || r.phase === 3) this.shaken = key
    return { opacity, shake }
  }
}

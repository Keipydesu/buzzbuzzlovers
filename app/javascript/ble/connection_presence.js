// Ephemeral UI presence only; never used for ownership or API authorization.
export class ConnectionPresence {
  constructor(account, onChange = () => {}, { Channel = globalThis.BroadcastChannel, now = () => Date.now(), onSaved = () => {} } = {}) {
    this.onChange = onChange; this.now = now; this.peers = new Map()
    this.onSaved = onSaved
    this.id = globalThis.crypto.randomUUID(); this.connected = false
    try {
      this.channel = new Channel(`pose-wearable-${account}`)
      this.channel.onmessage = ({ data }) => this.receive(data)
    } catch { /* Without cross-tab support, keep offering the connection page. */ }
    this.check()
  }

  receive(data) {
    if (data?.type === "saved") { this.onSaved(); return }
    if (data?.type === "probe") { this.announce(); return }
    if (data?.type !== "status" || typeof data.id !== "string") return
    if (data.connected === true) this.peers.set(data.id, this.now())
    else this.peers.delete(data.id)
    this.render()
  }

  setConnected(connected) {
    this.connected = connected
    this.announce(); this.render()
  }

  announce() {
    this.channel?.postMessage({ type: "status", id: this.id, connected: this.connected })
  }

  saved() { this.channel?.postMessage({ type: "saved" }) }

  check() {
    // A tab that crashes cannot send a disconnect; expire unanswered probes.
    for (const [id, seen] of this.peers) if (this.now() - seen > 15000) this.peers.delete(id)
    this.channel?.postMessage({ type: "probe" })
    this.render()
  }

  render() { this.onChange(this.connected || this.peers.size > 0) }

  close() {
    this.setConnected(false)
    this.channel?.close()
  }
}

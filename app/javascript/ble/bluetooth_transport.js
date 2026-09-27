export const SERVICE_UUID = "caa153e1-8bec-412c-a7ea-570bf12cbd13"
export const IDENTITY_UUID = "5a02ab16-022f-43a7-8b81-2d136526c605"
export const CONTROL_UUID = "883c8f42-529b-47ef-ae21-278020ae5c55"
export const WARNING_UUID = "9c052810-52d4-4fc9-9c03-f37e93874bc1"
export const SNAPSHOT_UUID = "3ea72a7d-ef99-4f43-95d7-d6860687824e"

export class BluetoothTransport {
  constructor({ onIdentity, onSnapshot, onWarning, onStatus, bluetooth = globalThis.navigator?.bluetooth, secure = globalThis.isSecureContext }) {
    Object.assign(this, { onIdentity, onSnapshot, onWarning, onStatus, bluetooth, secure })
    this.generation = 0; this.operations = Promise.resolve(); this.connection = null
  }
  get canCalibrate() { return Boolean(this.connection?.control?.properties?.write) }
  get supported() { return Boolean(this.secure && this.bluetooth?.requestDevice) }
  async connect() {
    if (!this.supported) { this.onStatus("unsupported", "Use a Web Bluetooth browser on a secure page to connect. Saved history still works here."); return }
    this.disconnect(false)
    const generation = this.generation
    const connection = { generation, device: null, snapshot: null }
    this.connection = connection
    const current = () => this.connection === connection && this.generation === generation
    const check = () => { if (!current()) throw new Error("Connection replaced") }
    this.onStatus("connecting")
    try {
      // Call synchronously from the click handler, before any awaited HTTP work.
      const device = await this.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] })
      check(); connection.device = device
      connection.onDisconnect = () => { if (current()) this.disconnect() }
      device.addEventListener("gattserverdisconnected", connection.onDisconnect)
      const server = await device.gatt.connect(); check()
      const service = await server.getPrimaryService(SERVICE_UUID); check()
      const identity = await service.getCharacteristic(IDENTITY_UUID); check()
      const identityValue = await identity.readValue(); check()
      this.onIdentity(identityValue)
      const snapshot = await service.getCharacteristic(SNAPSHOT_UUID); check()
      connection.snapshot = snapshot
      connection.onValue = event => { if (current()) this.onSnapshot(event.target.value) }
      snapshot.addEventListener("characteristicvaluechanged", connection.onValue)
      await snapshot.startNotifications(); check()
      if (this.onWarning) {
        try { connection.warning = await service.getCharacteristic(WARNING_UUID) }
        catch (error) { if (error.name !== "NotFoundError") throw error }
        check()
        if (connection.warning) {
          connection.onWarning = event => { if (current()) this.onWarning(event.target.value) }
          connection.warning.addEventListener("characteristicvaluechanged", connection.onWarning)
          await connection.warning.startNotifications(); check()
        }
      }
      try { connection.control = await service.getCharacteristic(CONTROL_UUID) }
      catch (error) { if (error.name !== "NotFoundError") throw error }
      check()
      this.onStatus("connected")
      await this.read()
    } catch (error) {
      if (!current()) {
        // A cancelled connect may complete late. Never disconnect a replacement using the same device.
        if (connection.device && this.connection?.device !== connection.device) connection.device.gatt?.disconnect()
        return
      }
      this.disconnect(false)
      this.onStatus("disconnected", error.name === "NotFoundError" ? "No wearable selected." : `Could not connect: ${error.message}`)
    }
  }
  calibrate() {
    const connection = this.connection
    if (!this.canCalibrate) return Promise.reject(new Error("This wearable needs a firmware update for software calibration."))
    const operation = this.operations.catch(() => {}).then(async () => {
      if (this.connection !== connection) throw new Error("Wearable disconnected")
      await connection.control.writeValueWithResponse(Uint8Array.of(1, 1))
      if (this.connection !== connection) throw new Error("Wearable disconnected")
    })
    this.operations = operation
    return operation
  }
  read() {
    const connection = this.connection
    if (!connection?.snapshot) return Promise.resolve()
    const operation = this.operations.catch(() => {}).then(async () => {
      if (this.connection !== connection) return
      const value = await connection.snapshot.readValue()
      if (this.connection !== connection) return
      this.onSnapshot(value)
      if (connection.warning) {
        const warning = await connection.warning.readValue()
        if (this.connection === connection) this.onWarning(warning)
      }
    })
    this.operations = operation
    return operation
  }
  disconnect(announce = true) {
    const connection = this.connection
    this.connection = null; this.generation++; this.operations = Promise.resolve()
    if (connection) {
      connection.warning?.removeEventListener("characteristicvaluechanged", connection.onWarning)
      connection.snapshot?.removeEventListener("characteristicvaluechanged", connection.onValue)
      connection.device?.removeEventListener("gattserverdisconnected", connection.onDisconnect)
      connection.device?.gatt?.disconnect()
    }
    if (announce) this.onStatus("disconnected")
  }
}

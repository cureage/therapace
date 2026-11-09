import ExpoModulesCore
import Muse

public class BloomMuseModule: Module, IXNMuseListener, IXNMuseConnectionListener, IXNMuseDataListener {
  private let manager = IXNMuseManagerIos.sharedManager()
  private var muses: [String: IXNMuse] = [:]
  private var activeMuse: IXNMuse?
  private var eegBuffers = Array(repeating: [Double](), count: 4)
  private var eegPacketCount = 0
  private var lastPacketTimestamp: Int64 = 0

  public func definition() -> ModuleDefinition {
    Name("BloomMuse")
    Events("onMuseDevice", "onMuseConnection", "onMuseEEG", "onMuseError")

    OnCreate {
      self.manager?.museListener = self
    }

    AsyncFunction("startScan") {
      guard let manager = self.manager else {
        throw Exception(name: "MuseUnavailable", description: "LibMuse could not initialize.")
      }
      manager.museListener = self
      manager.stopListening()
      manager.startListening()
    }

    AsyncFunction("stopScan") {
      self.manager?.stopListening()
    }

    AsyncFunction("connect") { (deviceId: String) in
      guard let manager = self.manager else {
        throw Exception(name: "MuseUnavailable", description: "LibMuse could not initialize.")
      }
      manager.stopListening()
      guard let muse = self.muses[deviceId] else {
        throw Exception(name: "MuseUnavailable", description: "The selected Muse is no longer available. Scan again.")
      }

      self.activeMuse?.unregisterAllListeners()
      self.activeMuse = muse
      self.eegBuffers = Array(repeating: [], count: 4)
      self.eegPacketCount = 0
      muse.unregisterAllListeners()
      muse.register(self)
      muse.register(self, type: .eeg)
      muse.setPreset(.preset21)
      muse.runAsynchronously()
    }

    AsyncFunction("disconnect") {
      self.activeMuse?.disconnect()
    }

    AsyncFunction("getSignalStrength") { (deviceId: String) -> Double? in
      guard let rssi = self.muses[deviceId]?.getRssi(), rssi.isFinite else {
        return nil
      }
      return rssi
    }
  }

  public func museListChanged() {
    guard let manager = manager else { return }
    for muse in manager.getMuses() {
      let id = muse.getMacAddress()
      muses[id] = muse
      sendEvent("onMuseDevice", [
        "id": id,
        "name": muse.getName(),
        "rssi": muse.getRssi().isFinite ? muse.getRssi() : NSNull()
      ])
    }
  }

  public func receive(_ packet: IXNMuseConnectionPacket, muse: IXNMuse?) {
    guard let muse = muse else { return }
    let state: String
    switch packet.currentConnectionState {
    case .connected:
      state = "connected"
    case .connecting:
      state = "connecting"
    case .disconnected:
      state = "disconnected"
    case .needsLicense:
      state = "needsLicense"
    case .needsUpdate:
      state = "needsUpdate"
    default:
      state = "unknown"
    }
    let rssi = muse.getRssi()
    sendEvent("onMuseConnection", [
      "id": muse.getMacAddress(),
      "name": muse.getName(),
      "rssi": rssi.isFinite ? rssi : NSNull(),
      "state": state
    ])
  }

  public func receive(_ packet: IXNMuseDataPacket?, muse: IXNMuse?) {
    guard let packet = packet, packet.packetType() == .eeg else { return }
    let channels: [IXNEeg] = [.EEG1, .EEG2, .EEG3, .EEG4]
    for (index, channel) in channels.enumerated() {
      eegBuffers[index].append(packet.getEegChannelValue(channel))
    }
    eegPacketCount += 1
    lastPacketTimestamp = packet.timestamp()

    if eegPacketCount >= 12 {
      sendEegBatch()
    }
  }

  public func receive(_ packet: IXNMuseArtifactPacket, muse: IXNMuse?) {}

  private func sendEegBatch() {
    sendEvent("onMuseEEG", [
      "timestamp": Double(lastPacketTimestamp) / 1000,
      "values": eegBuffers
    ])
    eegBuffers = Array(repeating: [], count: 4)
    eegPacketCount = 0
  }
}

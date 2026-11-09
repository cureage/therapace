import ExpoModulesCore
import Muse

public final class BloomMuseModule: Module {
  private var museManager: IXNMuseManagerIos?
  private var museListener: MuseDiscoveryListener?
  private var connectionListener: MuseConnectionListener?
  private var dataListener: MuseDataListener?
  private var errorListener: MuseErrorListener?
  private var discoveredMuses: [String: IXNMuse] = [:]
  private var activeMuse: IXNMuse?

  public func definition() -> ModuleDefinition {
    Name("BloomMuse")

    Events("onMuseDevice", "onMuseConnection", "onMuseEEG", "onMuseError")

    OnCreate {
      self.configureManager()
    }

    OnDestroy {
      self.museManager?.stopListening()
      self.activeMuse?.unregisterAllListeners()
      self.activeMuse?.disconnect()
    }

    AsyncFunction("startScan") {
      guard let manager = self.museManager else {
        throw MuseModuleError.managerUnavailable
      }
      manager.stopListening()
      manager.startListening()
    }

    AsyncFunction("stopScan") {
      self.museManager?.stopListening()
    }

    AsyncFunction("connect") { (deviceId: String) throws in
      try self.connectToMuse(deviceId)
    }

    AsyncFunction("disconnect") {
      self.activeMuse?.disconnect()
    }

    Function("getSignalStrength") { (deviceId: String) -> Double? in
      guard let muse = self.discoveredMuses[deviceId] ?? self.activeMuse,
            muse.getMacAddress() == deviceId else {
        return nil
      }
      let rssi = muse.getRssi()
      return rssi.isFinite ? rssi : nil
    }
  }

  private func configureManager() {
    let manager = IXNMuseManagerIos()
    museManager = manager
    museListener = MuseDiscoveryListener { [weak self] in
      self?.publishDiscoveredMuses()
    }
    manager.setMuseListener(museListener)
  }

  private func connectToMuse(_ deviceId: String) throws {
    guard let manager = museManager else {
      throw MuseModuleError.managerUnavailable
    }
    guard let muse = discoveredMuses[deviceId] else {
      throw MuseModuleError.deviceUnavailable
    }

    manager.stopListening()
    activeMuse?.unregisterAllListeners()
    activeMuse?.disconnect()
    activeMuse = muse

    let connectionListener = MuseConnectionListener { [weak self] packet, connectedMuse in
      self?.publishConnection(packet, muse: connectedMuse)
    }
    let dataListener = MuseDataListener { [weak self] packet, connectedMuse in
      self?.publishEEG(packet, muse: connectedMuse)
    }
    let errorListener = MuseErrorListener { [weak self] error, failedMuse in
      self?.publishError(error, muse: failedMuse)
    }
    self.connectionListener = connectionListener
    self.dataListener = dataListener
    self.errorListener = errorListener

    muse.unregisterAllListeners()
    muse.register(connectionListener)
    muse.register(dataListener, type: .eeg)
    muse.register(errorListener)
    muse.setPreset(IXNMusePreset.preset21)
    muse.runAsynchronously()
  }

  private func publishDiscoveredMuses() {
    guard let muses = museManager?.getMuses() else { return }
    for muse in muses {
      let deviceId = muse.getMacAddress()
      let rssi = muse.getRssi()
      discoveredMuses[deviceId] = muse
      sendEvent("onMuseDevice", [
        "id": deviceId,
        "name": muse.getName(),
        "rssi": rssi.isFinite ? rssi : NSNull()
      ])
    }
  }

  private func publishConnection(_ packet: IXNMuseConnectionPacket, muse: IXNMuse?) {
    guard let muse else { return }
    let deviceId = muse.getMacAddress()
    let state: String
    switch packet.currentConnectionState {
    case .connecting:
      state = "connecting"
    case .connected:
      state = "connected"
    case .disconnected:
      state = "disconnected"
      muse.unregisterAllListeners()
      if activeMuse?.getMacAddress() == deviceId {
        activeMuse = nil
      }
    case .needsLicense:
      state = "needsLicense"
    case .needsUpdate:
      state = "needsUpdate"
    default:
      state = "unknown"
    }

    let rssi = muse.getRssi()
    sendEvent("onMuseConnection", [
      "id": deviceId,
      "name": muse.getName(),
      "rssi": rssi.isFinite ? rssi : NSNull(),
      "state": state
    ])
  }

  private func publishEEG(_ packet: IXNMuseDataPacket?, muse: IXNMuse?) {
    guard let packet, packet.packetType() == .eeg else { return }
    let channels: [IXNEeg] = [.EEG1, .EEG2, .EEG3, .EEG4]
    let values = channels.map { channel -> [Double] in
      let value = packet.getEegChannelValue(channel)
      return [value.isFinite ? value : 0]
    }
    sendEvent("onMuseEEG", [
      "timestamp": Double(packet.timestamp()) / 1_000,
      "values": values
    ])
  }

  private func publishError(_ error: IXNError, muse: IXNMuse?) {
    sendEvent("onMuseError", ["message": error.info])
  }
}

private enum MuseModuleError: LocalizedError {
  case managerUnavailable
  case deviceUnavailable

  var errorDescription: String? {
    switch self {
    case .managerUnavailable:
      return "The Muse Bluetooth manager is unavailable."
    case .deviceUnavailable:
      return "The selected Muse is no longer available. Scan again."
    }
  }
}

private final class MuseDiscoveryListener: NSObject, IXNMuseListener {
  private let onChange: () -> Void

  init(onChange: @escaping () -> Void) {
    self.onChange = onChange
  }

  func museListChanged() {
    onChange()
  }
}

private final class MuseConnectionListener: NSObject, IXNMuseConnectionListener {
  private let onConnection: (IXNMuseConnectionPacket, IXNMuse?) -> Void

  init(onConnection: @escaping (IXNMuseConnectionPacket, IXNMuse?) -> Void) {
    self.onConnection = onConnection
  }

  func receive(_ packet: IXNMuseConnectionPacket, muse: IXNMuse?) {
    onConnection(packet, muse)
  }
}

private final class MuseDataListener: NSObject, IXNMuseDataListener {
  private let onData: (IXNMuseDataPacket?, IXNMuse?) -> Void

  init(onData: @escaping (IXNMuseDataPacket?, IXNMuse?) -> Void) {
    self.onData = onData
  }

  func receive(_ packet: IXNMuseDataPacket?, muse: IXNMuse?) {
    onData(packet, muse)
  }

  func receive(_ packet: IXNMuseArtifactPacket, muse: IXNMuse?) {}
}

private final class MuseErrorListener: NSObject, IXNMuseErrorListener {
  private let onError: (IXNError, IXNMuse?) -> Void

  init(onError: @escaping (IXNError, IXNMuse?) -> Void) {
    self.onError = onError
  }

  func receiveError(_ error: IXNError, muse: IXNMuse?) {
    onError(error, muse)
  }
}

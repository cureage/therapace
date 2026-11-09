package com.bloom.muse

import com.choosemuse.libmuse.ConnectionState
import com.choosemuse.libmuse.Eeg
import com.choosemuse.libmuse.Muse
import com.choosemuse.libmuse.MuseConnectionListener
import com.choosemuse.libmuse.MuseConnectionPacket
import com.choosemuse.libmuse.MuseDataListener
import com.choosemuse.libmuse.MuseDataPacket
import com.choosemuse.libmuse.MuseDataPacketType
import com.choosemuse.libmuse.MuseListener
import com.choosemuse.libmuse.MuseManagerAndroid
import com.choosemuse.libmuse.MusePreset
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BloomMuseModule : Module() {
  private lateinit var manager: MuseManagerAndroid
  private val muses = mutableMapOf<String, Muse>()
  private var activeMuse: Muse? = null
  private val eegBuffers = Array(4) { mutableListOf<Double>() }
  private var eegPacketCount = 0
  private var lastPacketTimestamp = 0L

  private val museListener = object : MuseListener() {
    override fun museListChanged() {
      synchronized(muses) {
        manager.muses.forEach { muse ->
          val id = muse.macAddress
          muses[id] = muse
          sendEvent(
            "onMuseDevice",
            mapOf("id" to id, "name" to muse.name, "rssi" to muse.rssi.toNullableRssi())
          )
        }
      }
    }
  }

  private val connectionListener = object : MuseConnectionListener() {
    override fun receiveMuseConnectionPacket(packet: MuseConnectionPacket, muse: Muse) {
      val state = when (packet.currentConnectionState) {
        ConnectionState.CONNECTING -> "connecting"
        ConnectionState.CONNECTED -> "connected"
        ConnectionState.DISCONNECTED -> "disconnected"
        ConnectionState.NEEDS_LICENSE -> "needsLicense"
        ConnectionState.NEEDS_UPDATE -> "needsUpdate"
        else -> "unknown"
      }
      sendEvent(
        "onMuseConnection",
        mapOf(
          "id" to muse.macAddress,
          "name" to muse.name,
          "rssi" to muse.rssi.toNullableRssi(),
          "state" to state
        )
      )
    }
  }

  private val dataListener = object : MuseDataListener() {
    override fun receiveMuseDataPacket(packet: MuseDataPacket, muse: Muse) {
      if (packet.packetType() != MuseDataPacketType.EEG) return

      val channels = arrayOf(Eeg.EEG1, Eeg.EEG2, Eeg.EEG3, Eeg.EEG4)
      channels.forEachIndexed { index, channel ->
        eegBuffers[index].add(packet.getEegChannelValue(channel))
      }
      eegPacketCount += 1
      lastPacketTimestamp = packet.timestamp()

      if (eegPacketCount >= EEG_BATCH_SIZE) {
        sendEegBatch()
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("BloomMuse")
    Events("onMuseDevice", "onMuseConnection", "onMuseEEG", "onMuseError")

    OnCreate {
      manager = MuseManagerAndroid.getInstance()
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("Muse requires an active Android application context.")
      manager.setContext(context)
    }

    AsyncFunction("startScan") {
      manager.museListener = museListener
      manager.stopListening()
      manager.startListening()
    }

    AsyncFunction("stopScan") {
      manager.stopListening()
    }

    AsyncFunction("connect") { deviceId: String ->
      manager.stopListening()
      val muse = synchronized(muses) { muses[deviceId] }
        ?: throw IllegalArgumentException("The selected Muse is no longer available. Scan again.")

      activeMuse?.unregisterAllListeners()
      activeMuse = muse
      eegPacketCount = 0
      eegBuffers.forEach { it.clear() }
      muse.unregisterAllListeners()
      muse.registerConnectionListener(connectionListener)
      muse.registerDataListener(dataListener, MuseDataPacketType.EEG)
      muse.setPreset(MusePreset.PRESET_21)
      muse.runAsynchronously()
    }

    AsyncFunction("disconnect") {
      activeMuse?.disconnect()
    }

    AsyncFunction("getSignalStrength") { deviceId: String ->
      synchronized(muses) { muses[deviceId] }?.rssi?.toNullableRssi()
    }
  }

  private fun Double.toNullableRssi(): Int? = takeIf { it.isFinite() }?.toInt()

  private fun sendEegBatch() {
    sendEvent(
      "onMuseEEG",
      mapOf(
        "timestamp" to lastPacketTimestamp / 1000.0,
        "values" to eegBuffers.map { it.toList() }
      )
    )
    eegBuffers.forEach { it.clear() }
    eegPacketCount = 0
  }

  private companion object {
    const val EEG_BATCH_SIZE = 12
  }
}

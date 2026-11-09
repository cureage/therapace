//
//  OSCSender.swift
//  MuseStatsIosSwift
//
//  Minimal Open Sound Control (OSC 1.0) client that sends UDP packets
//  using Apple's Network framework.
//

import Foundation
import Network

class OSCSender {
    private let queue = DispatchQueue(label: "OSCSender.queue")
    private var connection: NWConnection?

    // Synchronized on `queue`.
    private(set) var host: String
    private(set) var port: UInt16

    init(host: String, port: UInt16) {
        self.host = host
        self.port = port
        queue.async { [weak self] in
            self?.reconnectLocked()
        }
    }

    deinit {
        connection?.cancel()
    }

    /// Update the destination. If the endpoint actually changed the underlying
    /// UDP connection is torn down and rebuilt.
    func update(host: String, port: UInt16) {
        queue.async { [weak self] in
            guard let self = self else { return }
            if host == self.host && port == self.port && self.connection != nil {
                return
            }
            self.host = host
            self.port = port
            self.reconnectLocked()
        }
    }

    /// Send an OSC message with the given address pattern and float arguments.
    /// Safe to call from any thread. The packet is built on the caller and
    /// handed to the dedicated OSC queue for the actual transmission, so the
    /// 256 Hz EEG thread never contends with connection setup.
    func send(address: String, floats: [Float]) {
        let data = Self.buildPacket(address: address, floats: floats)
        queue.async { [weak self] in
            self?.connection?.send(content: data, completion: .contentProcessed { _ in })
        }
    }

    // MARK: - Private

    private func reconnectLocked() {
        connection?.cancel()
        connection = nil

        let trimmedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedHost.isEmpty,
              let portEndpoint = NWEndpoint.Port(rawValue: port) else {
            return
        }

        let hostEndpoint = NWEndpoint.Host(trimmedHost)
        let newConnection = NWConnection(host: hostEndpoint, port: portEndpoint, using: .udp)
        newConnection.stateUpdateHandler = { [weak self, weak newConnection] state in
            // As soon as the connection is established, push a tiny packet
            // through to absorb any one-time OS-level setup (local-network
            // permission evaluation, route lookup, first-packet socket
            // write). This runs on our own `queue`, so the app's main thread
            // never sees it.
            guard state == .ready, let connection = newConnection else { return }
            let warmup = Self.buildPacket(address: "/warmup", floats: [])
            connection.send(content: warmup, completion: .contentProcessed { _ in })
            self?.queue.async {
                // Clear the handler so we don't hold onto `self` forever.
                newConnection?.stateUpdateHandler = nil
            }
        }
        newConnection.start(queue: queue)
        connection = newConnection
    }

    private static func buildPacket(address: String, floats: [Float]) -> Data {
        var data = Data()
        data.append(oscString(address))

        var typeTag = ","
        for _ in floats { typeTag.append("f") }
        data.append(oscString(typeTag))

        for value in floats {
            var beBits = value.bitPattern.bigEndian
            withUnsafeBytes(of: &beBits) { buffer in
                data.append(contentsOf: buffer)
            }
        }
        return data
    }

    /// OSC strings are null terminated and padded with additional nulls until
    /// their total length is a multiple of 4 bytes.
    private static func oscString(_ string: String) -> Data {
        var data = Data(string.utf8)
        data.append(0)
        while data.count % 4 != 0 {
            data.append(0)
        }
        return data
    }
}

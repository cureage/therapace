/*
 * Minimal OSC over UDP sender for the TestLibMuseAndroid example.
 *
 * Implements just enough of OSC 1.0 to send simple messages with float
 * arguments. Sends happen on a dedicated HandlerThread so the UI and
 * data-callback threads are never blocked on network I/O or DNS.
 */

package com.choosemuse.example.libmuse;

import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;

public class OscSender {

    private static final String TAG = "OscSender";

    private final HandlerThread thread;
    private final Handler handler;

    // All the following are only accessed from the worker thread.
    private DatagramSocket socket;
    private InetAddress address;
    private int port;
    private String host;
    private boolean enabled;

    public OscSender() {
        thread = new HandlerThread("OscSender");
        thread.start();
        handler = new Handler(thread.getLooper());
    }

    /**
     * Update the destination host/port. Address resolution happens on the
     * worker thread so this method is safe to call from the UI thread.
     */
    public void setTarget(final String host, final int port) {
        handler.post(() -> {
            if (host == null || host.isEmpty() || port <= 0 || port > 65535) {
                this.address = null;
                this.host = host;
                this.port = port;
                return;
            }
            try {
                this.address = InetAddress.getByName(host);
                this.host = host;
                this.port = port;
            } catch (Exception e) {
                Log.w(TAG, "Failed to resolve host " + host + ": " + e.getMessage());
                this.address = null;
            }
        });
    }

    public void setEnabled(final boolean enabled) {
        handler.post(() -> this.enabled = enabled);
    }

    /**
     * Queue an OSC message for delivery. The float array is copied so the
     * caller is free to mutate the buffer after this call returns.
     */
    public void send(final String addressPattern, final float[] values) {
        final float[] copy = values.clone();
        handler.post(() -> deliver(addressPattern, copy));
    }

    public void send(final String addressPattern, final double[] values) {
        final float[] copy = new float[values.length];
        for (int i = 0; i < values.length; i++) {
            copy[i] = (float) values[i];
        }
        handler.post(() -> deliver(addressPattern, copy));
    }

    public void shutdown() {
        handler.post(() -> {
            if (socket != null) {
                socket.close();
                socket = null;
            }
        });
        thread.quitSafely();
    }

    // ---- worker-thread helpers ----

    private void deliver(String addressPattern, float[] values) {
        if (!enabled || address == null) {
            return;
        }
        try {
            if (socket == null) {
                socket = new DatagramSocket();
            }
            byte[] packet = encode(addressPattern, values);
            socket.send(new DatagramPacket(packet, packet.length, address, port));
        } catch (Exception e) {
            // A single failed send shouldn't kill the stream. Log at debug so
            // we don't spam the log when the target host is unreachable.
            Log.d(TAG, "OSC send failed: " + e.getMessage());
        }
    }

    /**
     * Encode an OSC message with the given address pattern and float
     * arguments into a byte array per OSC 1.0.
     */
    private static byte[] encode(String addressPattern, float[] values) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(32 + values.length * 4);
        writeOscString(out, addressPattern);
        StringBuilder tags = new StringBuilder(values.length + 1);
        tags.append(',');
        for (int i = 0; i < values.length; i++) {
            tags.append('f');
        }
        writeOscString(out, tags.toString());
        for (float v : values) {
            int bits = Float.floatToIntBits(v);
            out.write((bits >>> 24) & 0xFF);
            out.write((bits >>> 16) & 0xFF);
            out.write((bits >>> 8) & 0xFF);
            out.write(bits & 0xFF);
        }
        return out.toByteArray();
    }

    private static void writeOscString(ByteArrayOutputStream out, String s) {
        byte[] bytes = s.getBytes();
        out.write(bytes, 0, bytes.length);
        // OSC strings are null-terminated and padded to a 4-byte boundary.
        int padding = 4 - (bytes.length % 4);
        for (int i = 0; i < padding; i++) {
            out.write(0);
        }
    }
}

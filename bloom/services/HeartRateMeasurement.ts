import { toByteArray } from 'base64-js';

// Bluetooth Heart Rate Measurement (2A37): flags followed by uint8 or LE uint16 BPM.
export function decodeHeartRate(value: string): number | null {
  const bytes = toByteArray(value);
  if (bytes.length < 2) throw new Error('Incomplete heart-rate measurement.');
  const flags = bytes[0];
  if (flags & 1 && bytes.length < 3) throw new Error('Incomplete 16-bit heart-rate measurement.');
  if (flags & 4 && !(flags & 2)) return null; // Contact supported, but not detected.
  const bpm = flags & 1 ? bytes[1] | (bytes[2] << 8) : bytes[1];
  return bpm > 0 ? bpm : null;
}

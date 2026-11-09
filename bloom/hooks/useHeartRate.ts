import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  heartRateBluetoothService,
  type HeartRateState,
} from '@/services/HeartRateBluetoothService';

// A reading older than this no longer counts as the user's current heart rate.
const STALE_AFTER_MS = 10_000;

/**
 * Live heart-rate state from the connected Bluetooth monitor. `fresh` means a reading arrived
 * recently; `live` additionally means it carried a BPM (the sensor detected skin contact).
 */
export function useHeartRate() {
  const [state, setState] = useState<HeartRateState>({
    device: null,
    bpm: null,
    receivedAt: null,
    error: null,
  });
  const [now, setNow] = useState(() => Date.now());
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const unsubscribe = heartRateBluetoothService.subscribe(setState);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const appState = AppState.addEventListener('change', (next) => {
      setForeground(next === 'active');
      setNow(Date.now());
    });
    return () => {
      unsubscribe();
      clearInterval(timer);
      appState.remove();
    };
  }, []);

  const fresh = foreground && state.receivedAt !== null && now - state.receivedAt < STALE_AFTER_MS;
  return { state, fresh, live: fresh && state.bpm !== null };
}

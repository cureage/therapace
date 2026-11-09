import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

interface UseShakeOptions {
  threshold?: number;       // Sensitivity threshold (higher = harder shake required)
  updateInterval?: number;  // How often the sensor samples data (in ms)
  cooldown?: number;        // Time to wait before triggering another shake (in ms)
}

export const useShake = (
  onShake: () => void,
  options: UseShakeOptions = {}
) => {
  const { threshold = 1.8, updateInterval = 100, cooldown = 1000 } = options;

  const lastTriggerRef = useRef<number>(0);

  useEffect(() => {
    Accelerometer.setUpdateInterval(updateInterval);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      if (acceleration >= threshold && now - lastTriggerRef.current > cooldown) {
        lastTriggerRef.current = now;
        onShake();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [onShake, threshold, updateInterval, cooldown]);
};

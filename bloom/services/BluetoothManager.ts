import { BleManager } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

let manager: BleManager | null = null;

// One native central manager can keep Muse and a heart-rate sensor connected together.
export function getBluetoothManager(): BleManager {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Bluetooth requires a native iOS or Android build, not Expo Go or web.');
  }
  manager ??= new BleManager();
  return manager;
}

export async function prepareBluetooth(): Promise<BleManager> {
  if (Platform.OS === 'android') {
    const permissions =
      Number(Platform.Version) >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const results = await PermissionsAndroid.requestMultiple(permissions);
    if (
      permissions.some((permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED)
    ) {
      throw new Error('Allow Bluetooth permissions in Settings to connect a heart-rate monitor.');
    }
  }
  const ble = getBluetoothManager();
  // CoreBluetooth may briefly report Unknown while initializing.
  let state = await ble.state();
  for (let attempt = 0; (state === 'Unknown' || state === 'Resetting') && attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    state = await ble.state();
  }
  if (state !== 'PoweredOn') {
    throw new Error(
      state === 'Unauthorized'
        ? 'Allow Bluetooth access for Bloom in your phone settings.'
        : 'Turn on Bluetooth, then try again.'
    );
  }
  return ble;
}

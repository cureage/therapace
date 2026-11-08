import { endpoints, getApiUrl } from '@/utils/constants';

export type SensorPayload = {
  timestamp: string;
  device_id: string;
  sensor_values: Record<string, unknown>;
  battery_level?: number;
};

export async function reportSensorPayload(payload: SensorPayload, token: string): Promise<void> {
  const response = await fetch(getApiUrl(endpoints.sensorIngest), {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Sensor upload failed (${response.status}): ${responseBody || response.statusText}`
    );
  }
}

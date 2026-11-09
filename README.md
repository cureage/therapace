# therapace
AI exposure therapy at your own pace

## Sensor streaming API

The Django backend accepts authenticated Muse/mobile sensor samples over HTTP
and provides a duplex WebSocket for ongoing samples and server status updates.

Install backend dependencies, migrate the database, then run the ASGI app:

```sh
cd backend
pip install -r requirements.txt
python manage.py migrate
daphne -b 0.0.0.0 -p 8000 backend.asgi:application
```

Obtain a DRF token from the existing `/api/auth/login/` endpoint. Submit a
sample over HTTP (useful for cURL debugging):

```sh
curl -X POST http://127.0.0.1:8000/api/sensors/ \
  -H 'Authorization: Token YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "timestamp": "2026-11-07T21:00:00Z",
    "device_id": "muse-1234",
    "sensor_values": {
      "eeg": [12.4, 13.1, 11.8],
      "accelerometer": {"x": 0.1, "y": -0.2, "z": 0.9}
    },
    "battery_level": 87.5
  }'
```

For continuous duplex streaming, connect Postman to
`ws://127.0.0.1:8000/ws/sensors/` and add the header
`Authorization: Token YOUR_TOKEN`. Send JSON samples with the same shape as
above. The server acknowledges valid samples and sends a `status` message
immediately and every five seconds; its `commands` array is an empty placeholder
for future control messages. The server logs each received payload as formatted
JSON to its console before validation.

The endpoints require the existing DRF token. Full sensor payloads may contain
sensitive biometric data, so disable or redact this logger and use suitable log
retention controls before deploying with real users.

### Bloom app reporting

Set `EXPO_PUBLIC_API_URL` to the backend origin before starting Expo (do not
include `/api`):

```sh
cd bloom
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 npx expo start
```

Use `http://10.0.2.2:8000` for the Android emulator, `http://localhost:8000`
for the iOS simulator, or your computer's reachable LAN address for a physical
phone. For a physical device, configure Django `ALLOWED_HOSTS` to include the
backend host and make sure the phone can reach that host on the network. For a
local development server, set `DJANGO_ALLOWED_HOSTS` to comma-separated host
names and bind Django to `0.0.0.0`, for example:

```sh
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,172.28.50.1 \
  python manage.py runserver 0.0.0.0:8000
```

Only expose a development server on a trusted network.

Bloom signs in at `/api/auth/login/` and keeps the returned DRF token in
in-memory app state. While an authenticated Muse device is connected, the app
uses the native LibMuse SDK to discover the headband, connect with its `p21`
four-channel EEG preset, and receive the TP9, AF7, AF8, and TP10 samples in
microvolts at 256 Hz. The app batches samples and posts them to `/api/sensors/`
every five seconds. The payload includes `sensor_values.eeg` with its sample
rate, units, channel names, packet sequence IDs, timestamps, and sample arrays;
available Bluetooth RSSI is included as `sensor_values.rssi_dbm`.

Settings displays the latest reading from each EEG channel and offers a JSON
preview of the sensor payload. Sample payload previews are printed to the Xcode
device console even when the app is not authenticated. Authenticated payloads
are also logged in the Django console by the existing `sensor_stream` logger.

### Fitbit Air live heart rate

Settings now has a Fitbit / Bluetooth heart-rate sensor section below the Muse
controls. It subscribes directly to the standard Bluetooth Heart Rate Service
(`180D`), Heart Rate Measurement (`2A37`), and displays BPM as notifications arrive.
It does not use Fitbit account APIs or require a Django login. Heart-rate readings
are displayed locally; they are not uploaded to Django. Muse and Fitbit can stay
connected together, but only one scan or connection operation runs at a time on
the Settings page. Connections remain active when leaving the page; use Disconnect
to stop the heart-rate subscription. Streaming is intended for foreground use.

On your phone, open **Google Health → Connections → your Fitbit Air → Share heart
rate → Get started**, then return to Bloom, open Settings, scan, and select your
Air. Wear it snugly and approve any system pairing prompts. Other devices that
advertise the Bluetooth Heart Rate Service may also appear. A successful Bluetooth
connection alone does not guarantee readings: the device must expose a notifying
Heart Rate Measurement characteristic and have heart-rate sharing enabled.
The panel hides readings after ten seconds without updates or while backgrounded.

Google's setup guide:
https://support.google.com/googlehealth/answer/14236705?hl=en

For your friend's Mac (with Xcode and iOS signing configured):

```sh
cd bloom
npm ci
npx expo run:ios --device
```

Use a physical iPhone with Bluetooth enabled. This requires a native development
build, not Expo Go, a web browser, or an iOS simulator. The Expo BLE plugin includes
the Bluetooth permission message for both Muse and Fitbit; rebuild the native app
to apply it. If using an already-generated `ios/` project, run
`npx expo prebuild --platform ios` before compiling so the plugin settings apply.
Device compatibility and live notification delivery still require hardware testing.

Decoder checks (no Bluetooth hardware required):

```sh
cd bloom
node --test services/HeartRateMeasurement.test.cjs
```

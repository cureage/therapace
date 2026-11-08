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

## User streaks

An authenticated completed EEG session counts as activity for its UTC calendar
day. Save a completed session with `POST /api/sessions/`:

```sh
curl -X POST http://127.0.0.1:8000/api/sessions/ \
  -H 'Authorization: Token YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"session_data": {"duration_seconds": 300}}'
```

The response includes the session ID and the user's `streak`,
`max_streak`, and `last_activity_date`. Multiple sessions on one UTC day count
as one streak day. The current streak is active through the day after the last
session and is reported as zero once that day has passed. These streak fields
are also available from `/api/auth/me/`.

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
posts a sample to `/api/sensors/` every five seconds. At present MuseBluetoothService
only exposes Bluetooth RSSI, so the submitted `sensor_values` contain
`rssi_dbm`; this does not represent EEG data. The current mobile code does not
subscribe to or decode Muse EEG notifications.

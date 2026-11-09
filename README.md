# therapace
AI exposure therapy at your own pace

## Sensor streaming API

The Django backend accepts authenticated Muse/mobile sensor samples over HTTP
and provides a duplex WebSocket for ongoing samples and server status updates.

Install backend dependencies and migrate the database. On macOS, launch the
backend for phone testing with:

```sh
cd backend
pip install -r requirements.txt
python manage.py migrate
./run-lan.sh
```

The script detects the current LAN IPv4 address, adds it to Django's allowed
hosts, and starts Daphne on port 8000 bound to all interfaces. Set `PORT` to use
a different port. The phone and Mac must be on the same reachable network.

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
phone. For a physical device, set `EXPO_PUBLIC_API_URL` to the LAN URL printed
by `backend/run-lan.sh` and make sure the phone can reach the Mac on the network.

Only expose a development server on a trusted network.

### Deploying the backend to EC2

The installer supports Ubuntu 22.04/24.04 and Amazon Linux 2023 EC2 instances.
Clone the repository under `/opt/therapace`, then install the backend and
Nginx:

```sh
sudo git clone https://github.com/cureage/therapace.git /opt/therapace
cd /opt/therapace
sudo env APP_HOSTNAME=api.example.com \
  LETSENCRYPT_EMAIL=admin@example.com \
  ./backend/deploy-ec2.sh
```

For Amazon Linux 2023, the script installs Python 3.13 and uses `dnf`; it
configures Nginx under `/etc/nginx/conf.d` and applies SELinux rules for the
static files and Nginx proxy. Amazon Linux 2 is not supported.

Set `APP_HOSTNAME` to a DNS name pointed at the instance or its public IPv4
address. The installer requires a Let's Encrypt certificate and enforces
HTTPS; IP addresses use a short-lived certificate with automatic renewal.
Provide a contact address with `LETSENCRYPT_EMAIL` (or enter it when prompted).
The EC2 security group must allow inbound TCP 80 and 443; restrict SSH to
trusted addresses and do not open ports 8000 or 8001. The installer configures
Nginx to redirect HTTP to HTTPS and proxy HTTP and WebSocket traffic to Gunicorn
and Daphne, then runs migrations and collects static files. Check the
`therapace-gunicorn`, `therapace-daphne`, `nginx`, and
`therapace-certbot-renew.timer` systemd units with `systemctl status`.

The installer uses the existing SQLite database for a single-instance setup.
Back up `backend/db.sqlite3` and the `/etc/therapace/backend.env` secret. Moving
to managed PostgreSQL for multi-instance or higher-availability deployments
requires configuring the Django database settings and migrating the data. For
the mobile app, set `EXPO_PUBLIC_API_URL` to the HTTPS URL printed by the
installer before building or starting Expo.

Bloom signs in at `/api/auth/login/` and keeps the returned DRF token in
in-memory app state. Bloom uses the native LibMuse SDK to discover the headband,
connect with its `p21` four-channel EEG preset, and receive TP9, AF7, AF8, and TP10
samples in microvolts at 256 Hz. During video playback, Bloom records Muse EEG
packets and Fitbit heart-rate notifications. It saves the recording at natural
completion or cancellation through the [session API](backend/SESSION_API.md).

Settings displays the latest reading from each EEG channel and offers a JSON
preview of the sensor payload. Sample payload previews are printed to the Xcode
device console even when the app is not authenticated.

### Fitbit Air live heart rate

Settings now has a Fitbit / Bluetooth heart-rate sensor section below the Muse
controls. It subscribes directly to the standard Bluetooth Heart Rate Service
(`180D`), Heart Rate Measurement (`2A37`), and displays BPM as notifications arrive.
The live Settings display uses Bluetooth directly. Bloom uploads readings
captured during signed-in video sessions. Muse and Fitbit can stay
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

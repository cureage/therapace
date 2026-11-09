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

### Leaderboard

Bloom's authenticated `GET /api/leaderboard/?sort=streak` endpoint returns
users ordered by their current streak. Use `sort=conquered` to order by the
number of distinct fear labels with at least one completed EEG session. Partial
sessions do not count. The response includes only user IDs, display names, and
the two leaderboard metrics; it does not expose email addresses. Users without
an active streak are reported with a streak of zero.

To populate a development database with repeatable leaderboard demo users,
fears, completed sessions, and streak days, run:

```sh
cd backend
python manage.py seed_leaderboard
```

The command uses reserved `example.test` addresses and unusable passwords, and
can be rerun without creating duplicate activity.

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
  GEMINI_API_KEY=your-gemini-key \
  ./backend/deploy-ec2.sh
```

`GEMINI_API_KEY` enables [conquer page videos](#conquer-page-exposure-videos).
The installer saves it in `/etc/therapace/backend.env` and keeps it on later
runs, so you only need to pass it once (or when you change it).
For an existing EC2 install, you can also set it in
`/etc/therapace/backend.env` and restart `therapace-gunicorn` and
`therapace-daphne`. If you use a project `.env` instead, put it in
`backend/.env` beside `manage.py` (not in `backend/backend/`); the backend
loads that file explicitly.

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

### Wearable live heart rate

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

## Conquer page exposure videos

On the Conquer tab, the user picks a fear, an intensity from 1 (gentle:
cartoon-like and far away) to 5 (intense: right up close), and a session length
from 3 seconds to 1 minute. Bloom asks the backend for a video. The backend
writes an exposure-therapy prompt for that fear and intensity and generates the
clip with Gemini Omni Flash through the Interactions API, the same call as
`backend/test.py`. While Gemini works (usually a minute or two), the app shows
a breathing exercise. It then streams the finished MP4 from the backend.

Gemini generates at most 15 seconds per clip, so longer sessions loop the clip
until the chosen time has played. The session then ends and is saved as usual.

Video output needs a paid Gemini API key; it is billed per second of video
(about $0.07/s at 720p for `gemini-omni-flash-preview`). Set the key and apply the
migration:

```sh
cd backend
export GEMINI_API_KEY=your-gemini-key   # PowerShell: $env:GEMINI_API_KEY="your-gemini-key"
python manage.py migrate
./run-lan.sh
```

Without a key, `POST /api/videos/` returns 503. Optional settings:

| Variable | Default | Notes |
| --- | --- | --- |
| `GEMINI_VIDEO_MODEL` | `gemini-omni-flash-preview` | |
| `GEMINI_VIDEO_RESOLUTION` | `720p` | `360p`, `720p`, `1080p` or `4k` |
| `GEMINI_VIDEO_ASPECT_RATIO` | `9:16` | Portrait fills the phone screen; `16:9` also works |
| `GEMINI_VIDEO_MAX_CLIP_SECONDS` | `15` | The model's per-clip limit (10 for `gemini-omni-flash-preview`) |
| `GEMINI_VIDEO_TIMEOUT_SECONDS` | `600` | Longest wait for one generation |
| `GEMINI_VIDEO_MAX_CONCURRENT` | `2` | Generations at once in each server process |
| `GEMINI_VIDEO_RATE_LIMIT` | `30/hour` | Video requests per user |
| `DJANGO_MEDIA_ROOT` | `backend/media` | Where generated videos are stored |

The endpoints use the usual `Authorization: Token YOUR_TOKEN` header:

- `POST /api/videos/` with
  `{"fear": "Spiders", "intensity": 3, "duration_seconds": 30, "request_key": "optional-retry-key"}`
  returns 202 and the video with `status: "pending"`. Sending the same
  `request_key` again returns that video instead of paying for another one.
- `GET /api/videos/{id}/`: poll until `status` is `ready` (then `stream_url` is
  set) or `failed` (`error_message` says why).
- `GET /api/videos/{id}/stream/`: the MP4, with the HTTP Range support that
  iOS and Android video players need for streaming.

Generation runs on a background thread inside the Gunicorn or Daphne process,
so no extra services are needed. Restarting the backend abandons generations in
progress; they are marked failed the next time the app polls them. Videos are
visible only to their owner and are not served by Nginx; back up
`backend/media` along with the database.

## Datasets

The EEG fear model in `backend/inference` was trained using the EmoKey Moments
Muse EEG Dataset (EKM-ED). It contains Muse S EEG recordings from 47
participants watching emotion-eliciting film clips (including fear), with
key-moment timestamps and self-reported emotion ratings. The dataset is
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Garcia-Moreno, F. M., & Badenes-Sastre, M. (2020). *EmoKey Moments Muse EEG
> Dataset (EKM-ED): A Comprehensive Collection of Muse S EEG Data and Key
> Emotional Moments* (Version 1.0) [Data set]. Zenodo.
> https://doi.org/10.5281/zenodo.8431451

```bibtex
@dataset{francisco_m_garcia_moreno_2020_8431451,
  author    = {Francisco M. Garcia-Moreno and Marta Badenes-Sastre},
  title     = {EmoKey Moments Muse EEG Dataset (EKM-ED): A Comprehensive
               Collection of Muse S EEG Data and Key Emotional Moments},
  month     = sep,
  year      = 2020,
  publisher = {Zenodo},
  version   = {1.0},
  doi       = {10.5281/zenodo.8431451},
  url       = {https://doi.org/10.5281/zenodo.8431451}
}
```
## Presentation Slides
presentation slides can be found [here](Bloom%20-%20Nathacks%202026.pdf)

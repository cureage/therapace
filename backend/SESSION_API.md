# Session sensor storage

`EEGSession` remains the parent session (including its existing metadata and user
relationship). `SessionReading` stores each timestamped heart-rate or EEG sample
as a separate row linked to it. This preserves every reading across uploads and
allows time-ordered graph queries without rewriting a large JSON field.
Existing `session_data` values are retained as-is by the migration; arbitrary
legacy JSON is not automatically converted into readings.

All requests require `Authorization: Token YOUR_TOKEN`.

## Create the session

`POST /api/sessions/`

```json
{
  "session_data": {
    "title": "First exposure session"
  }
}
```

Use the returned `id` as `session_id` (an integer, not a UUID). The existing endpoint
records daily streak activity for completed sessions. Bloom sends
`recording_key`, `started_at`, `ended_at`, and `status` alongside `session_data`:

```json
{
  "recording_key": "1794166200000-example",
  "status": "partial",
  "started_at": "2026-11-08T19:30:00.000Z",
  "ended_at": "2026-11-08T19:30:05.000Z",
  "session_data": { "fear": "Spiders" }
}
```

Bloom uses `complete` when playback reaches the end and `partial` when the user
cancels. Partial sessions do not award streak credit. Reusing a recording key
returns the existing session for that user so the app can safely retry uploads.

## Append heart-rate readings

`POST /api/sessions/42/readings/`

```json
{
  "session_id": 42,
  "type": "heart_rate",
  "device_id": "fitbit-device-id",
  "data": {
    "unit": "bpm",
    "samples": [
      { "timestamp": "2026-11-08T19:30:01.125Z", "value": 72 },
      { "timestamp": "2026-11-08T19:30:02.450Z", "value": 78 }
    ]
  }
}
```

Send every actual device reading, with its measurement timestamp, or the frontend
notification receipt timestamp when the device provides none. Do not invent
samples to fill missing seconds. Each batch accepts 1–1000 samples; there is no
ten-reading cap on a session. Update the local graph immediately and upload new
samples periodically, retaining unsent batches until the backend acknowledges them.

## Append EEG samples to the same session

`POST /api/sessions/42/readings/`

```json
{
  "session_id": 42,
  "type": "eeg",
  "device_id": "muse-device-id",
  "data": {
    "unit": "uV",
    "samples": [
      {
        "timestamp": "2026-11-08T19:30:01.125Z",
        "channels": { "TP9": 12.4, "AF7": -8.2, "AF8": 6.1, "TP10": 10.7 }
      }
    ]
  }
}
```

Only submit channels decoded from the actual device. Samples store JSON `data`
containing their unit and either `value` or `channels`; `timestamp` and server
`received_at` are separate database fields. Each batch is validated before writing;
an invalid sample rejects the whole batch. Retrying the same session/type/device/
timestamp does not duplicate a sample or overwrite its first accepted value.
`accepted_samples` in the response includes already-saved samples from retries.

Bloom's Muse bridge sends per-channel packets. The app saves the packet arrays
directly using the same endpoint:

```json
{
  "session_id": 42,
  "type": "eeg",
  "device_id": "muse-device-id",
  "data": {
    "unit": "uV",
    "sampling_rate_hz": 256,
    "samples": [
      {
        "timestamp": "2026-11-08T19:30:01.125Z",
        "sequence_id": 12,
        "channel": "TP9",
        "samples": [12.4, 11.9, 12.1]
      }
    ]
  }
}
```

Each packet becomes one reading with its timestamp in a database column and its
unit, sampling rate, sequence, channel, and sample values in JSON. Packet sequence
distinguishes packets received in the same millisecond. For plotting, use the
packet receipt timestamp as an approximate time anchor and the sample interval
of 1/256 second for spacing within the packet.

## Read graph data

`GET /api/sessions/42/readings/?type=heart_rate&limit=1000&offset=0`

Returns `count`, `next`, `previous`, and timestamp-ordered `results`. Follow `next`
for additional pages. Use `type=eeg` for EEG, or omit `type` to retrieve both.
Other users cannot read or append to this session.

Bloom records from the first playback event to natural completion or cancellation.
It submits heart-rate and EEG batches from whichever sensors reported readings.
The app buffers the recording in memory and keeps it on the session screen for
retry if an upload fails.

Apply the migration before running:

```sh
cd backend
python manage.py migrate
python manage.py test users
```

# Hermes Android bridge — setup guide

ULTRON's "hands" come from [Hermes](https://github.com/NousResearch/hermes-agent) + the [hermes-android](https://github.com/lite/hermes-android) bridge. The phone connects **out** to a relay, so no port forwarding or VPN is needed.

```
Phone (Hermes Bridge app) ──WebSocket──> Hermes relay (port 8766) <──WebSocket── ULTRON
```

## What you need

- An Android phone (Android 8+)
- A machine that can run the Hermes relay (can be the same one running ULTRON)
- Both on the same network, or a relay with a public address

## Step 1 — Install the bridge app on the phone

Option A (easiest): download the latest debug APK from the
[hermes-android releases](https://github.com/lite/hermes-android/releases) and install it.
Enable "Install unknown apps" when Android asks.

Option B (build from source):

```bash
git clone https://github.com/lite/hermes-android.git
cd hermes-android/hermes-android-bridge
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/hermes-android-*.apk
```

## Step 2 — Grant permissions on the phone

Open **Hermes Bridge** and:

1. Enable **Accessibility Service** → find Hermes Bridge → ON
2. Enable **Status Overlay** (draw over other apps)
3. Grant **Screen Recording** (needed for screenshots)
4. In Settings → Apps → Hermes Bridge → Permissions, allow **Location**, **Contacts**, **SMS**, **Phone** as needed

Accessibility is mandatory — all device tools use it.

## Step 3 — Run the Hermes relay

Install and start `hermes-agent` with the android plugin, or run the relay from
`hermes-android` directly:

```bash
cd hermes-android
pip install -e .
python -m hermes_android.relay   # listens on 0.0.0.0:8766 by default
```

The phone app will show a **6-character pairing code**.

## Step 4 — Pair the phone

In the phone app, enter the relay address (e.g. `http://192.168.1.20:8766`) and tap **Connect**. The relay reports the device as paired.

## Step 5 — Connect ULTRON

1. In ULTRON, click the **📱** button (top-right).
2. Enter the relay URL, e.g. `http://localhost:8766`.
3. Enter the 6-character pairing code.
4. Click **PAIR**.

The status line changes to **Paired · 1 device(s) online**.

## Step 6 — Use the tools

The panel lists a focused subset of Hermes' 38 tools:

| Button | What it does |
| --- | --- |
| Ping device | Check the phone is alive |
| Read screen | Get the accessibility tree |
| Screenshot | Capture the current screen |
| List apps / Current app | Inspect installed / foreground apps |
| Notifications | Read current notifications |
| Press HOME | Send a key event |
| Location | Get GPS location |
| Read clipboard | Read phone clipboard |
| Speak on phone | Text-to-speech on the device |

Results appear in the box below the buttons.

## Adding more tools

`lib/hermes.ts` uses a JSON envelope:

```json
{ "type": "tool", "id": "1", "tool": "android_tap", "args": { "x": 500, "y": 900 } }
```

Add any of the 38 `android_*` tools to `ANDROID_TOOLS` with the right args. If your relay uses a different envelope, edit `send` / `onMessage` in `HermesClient`.

## Security

- Pairing is code-based and rate-limited by the relay.
- The phone connects outward — it is never directly exposed.
- The default transport is `ws://`; put a TLS proxy in front for anything beyond a trusted LAN.
- A paired bridge has full device access. Only pair with relays you control.

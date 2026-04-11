# Proxmox Streaming Jukebox (Spotify + Librespot)

This project gives you a web jukebox where users can:

- Search Spotify tracks
- Add tracks to a shared local queue
- Push one or all queued tracks to Spotify playback
- Target a playback device that outputs from your Proxmox host sound card
- Offer a mobile-friendly employee request page backed by Mopidy queue controls

## Architecture

- `Node/Express app` (this repo): OAuth, search API, shared queue, browser UI
- `Spotify account` (Premium required for full remote playback control)
- `librespot` on Proxmox host: appears as a Spotify Connect device and outputs to host audio
- `Mopidy` (JSON-RPC endpoint): powers the employee request queue on `/requests.html`

## 1) Create Spotify App

1. Go to Spotify Developer Dashboard and create an app.
2. Add redirect URI: `http://YOUR_HOST:3000/auth/callback`
3. Copy Client ID and Client Secret.

## 2) Configure This App

1. Copy `.env.example` to `.env`
2. Fill values:

```env
PORT=3000
BASE_URL=http://YOUR_HOST:3000
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://YOUR_HOST:3000/auth/callback
SPOTIFY_DEVICE_ID=
MOPIDY_URL=http://YOUR_MOPIDY_HOST:6680/mopidy/rpc
EMPLOYEE_PIN=1234
MAX_PENDING_PER_USER=3
```

3. Install and run:

```bash
npm install
npm run dev
```

Open `http://YOUR_HOST:3000`.

Employee request page: `http://YOUR_HOST:3000/requests.html`
Short alias: `http://YOUR_HOST:3000/requests`

## Employee Request Page

The `/requests.html` page is designed for phone usage by staff.

- Join with a display name and optional PIN
- Search tracks through Mopidy (`core.library.search`)
- Add songs into Mopidy's tracklist queue (`core.tracklist.add`)
- See current song and up-next queue, including who requested each track
- Enforce a per-user pending limit via `MAX_PENDING_PER_USER`

Additional hardening knobs:

- `EMPLOYEE_SESSION_TTL_MINUTES` (default `480`) for auto-expiring employee sessions
- `REQUESTS_RATE_WINDOW_MS` (default `60000`) rate-limit window for employee API calls
- `REQUESTS_RATE_MAX` (default `40`) max employee API calls per window

If your Node app runs in a different container/host than Mopidy, set `MOPIDY_URL` to a reachable address and ensure firewall rules allow access.

## 3) Proxmox Host Audio + Librespot

On the Proxmox host (or a Linux VM/container with real audio passthrough):

```bash
sudo apt update
sudo apt install -y curl
curl -L https://github.com/librespot-org/librespot/releases/download/v0.6.0/librespot-x86_64-unknown-linux-gnu.tar.gz | tar -xz
sudo mv librespot /usr/local/bin/librespot
```

Run it manually first:

```bash
librespot --name "Proxmox Jukebox" --backend alsa
```

If ALSA fails, try PulseAudio backend:

```bash
librespot --name "Proxmox Jukebox" --backend pulseaudio
```

Then from your web app:

1. Connect Spotify
2. Refresh devices
3. Select `Proxmox Jukebox`
4. Click `Activate Device`
5. Search songs and add/send/play

## 4) Optional systemd service

Create `/etc/systemd/system/librespot.service`:

```ini
[Unit]
Description=Librespot (Spotify Connect)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/librespot --name Proxmox\ Jukebox --backend alsa
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now librespot
```

## Notes / Limitations

- Spotify API playback control requires a user token and typically Spotify Premium.
- API behavior can vary by region/account; device transfer may require active session state.
- If your Proxmox host has no local audio hardware, run librespot on a VM/LXC with passed-through audio device.

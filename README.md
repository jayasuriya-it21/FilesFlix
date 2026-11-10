# FileFlix

Self-hosted, local-network media streaming with a Netflix-style experience. Point it at a
folder on your PC and any device on the same network — phone, tablet, laptop, smart TV
browser — can browse and stream it. No cloud, no accounts for viewers, no telemetry.

```
Client (public)                      Host (password-protected)
┌──────────────────────────┐         ┌──────────────────────────────┐
│ browse / search / filter │         │ pick media directory         │
│ thumbnails, breadcrumbs  │  HTTP   │ CPU · RAM · disk · FFmpeg    │
│ OTT video/audio player   │◀───────▶│ activity log · settings      │
└──────────────────────────┘         └──────────────────────────────┘
```

## Quick start

Requires Node.js **18.15+** (no other runtime deps beyond Express).

```bash
npm install
npm start
```

The console prints every LAN URL, for example `http://192.168.1.50:7010`.

1. Open **`/host`** on the host machine → create the host password (first run).
2. Point it at your media folder (e.g. `D:\Media` or `/home/you/Videos`).
3. Share any printed URL with devices on the same Wi-Fi/LAN. Done.

Data lives in `data/`: `config.json` (port, media dir, host password hash),
`log.jsonl` (activity log) and `cache/` (thumbnails, metadata), all git-ignored —
nothing sensitive is committed.

## What works — and what honestly doesn't (yet)

| Feature | Status |
|---|---|
| HTTP Range streaming (video/audio), images, docs, downloads | ✅ |
| MKV/AVI/TS remux and unsupported-codec video transcoding to HLS | ✅ with FFmpeg; requires a compatible browser |
| Grid + list view, breadcrumbs, real-time search, type filters | ✅ |
| OTT player: ±10 s skip, speed, volume/mute, fullscreen | ✅ |
| Seek-preview thumbnails on hover (sprite sheets, cached) | ✅ with FFmpeg |
| **Multiple subtitles** (extracted from MKV/etc. to WebVTT, cached) | ✅ with FFmpeg |
| External sibling `.srt`/`.vtt` subtitles | ✅ no FFmpeg needed |
| **Multiple audio tracks** | ⚠️ browser-dependent¹ |
| Video thumbnails (lazy, background single-worker queue) | ✅ with FFmpeg |
| Play/download, subtitle & login activity logging | ✅ |
| Host panel: CPU/RAM/disk/uptime/FFmpeg status, log tail | ✅ |

**¹ Audio tracks honesty:** browsers only expose `HTMLMediaElement.audioTracks`
where supported (Safari does; Chromium generally does not). FileFlix detects this
and shows the menu only when switching can actually work. Where it can't, the
panel says so — no fake capability is advertised.

**HLS audio:** the compatibility pipeline currently selects the first audio
stream. Alternate-language audio switching is not yet implemented for HLS.
Supported browser codecs stream directly; compatible MKVs are repackaged without
re-encoding. Other videos are converted to H.264/AAC. This covers common local
video formats, not DRM-protected, corrupt, or every possible media file.

**Without FFmpeg:** browsing and browser-compatible playback still work, but
HLS conversion, video thumbnails, seek-previews, embedded-subtitle extraction
and audio-track metadata are unavailable. The host
panel shows exactly how to install it (`winget install Gyan.FFmpeg`,
`sudo apt install ffmpeg`) or set `FFMPEG_PATH`/`FFPROBE_PATH`; it is detected
automatically, without a restart.

## Security & privacy posture

- **Client is public on the LAN by design** — that's the product. Only the host
  panel asks for a password (scrypt-hashed, HttpOnly SameSite cookie, per-IP
  login rate limit).
- **Path containment**: every file API addresses a *relative* path under the
  media root; absolute paths, `..`, and symlink escapes are refused.
- **No telemetry, no analytics, no third-party requests.** Activity logging is
  local-only (`data/log.jsonl`), viewable in the host panel.
- Video stream requests carry `Content-Disposition: inline` only for the media
  root; downloads are explicit.

## Performance notes

- Streams are never fully buffered: `fs.createReadStream` range slices go
  straight to the socket; client-side `<video>` buffering does the rest.
- Thumbnail generation: 1 worker, 200 ms gap between jobs, capped queue,
  content-addressed cache (`path+mtime+size`), boot-time eviction caps.
- CPU% is sampled on demand — no background polling.
- HLS transcoding uses CPU and disk while encoding; high-resolution HEVC may
  not convert in real time on slower hosts. Seeking is limited to generated
  segments until conversion completes. Completed sessions are reused; idle
  encoders stop after two minutes. Session-count limits are not a disk-byte quota.
- Zero frameworks, zero blur/shader effects; animations are transform-only.

## API (all under `/api`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /config` | — | whether a library exists |
| `GET /browse?dir=rel` | — | listing + breadcrumbs (+ queues thumbs) |
| `GET /search?q=` | — | bounded recursive search |
| `GET /stream?path=rel` | — | Range-request streaming (videos/audio/images/docs) |
| `GET /hls/prepare?path=rel` | — | choose native playback or create/reuse an HLS session |
| `GET /hls/:key/master.m3u8` | — | growing or completed HLS playlist |
| `GET /hls/:key/seg/:name` | — | initialization and media fragments |
| `GET /download?path=rel` | — | attachment download |
| `GET /thumb?path=rel` | — | cached video thumbnail (404 until ready) |
| `GET /meta?path=rel` | — | duration, audio/subtitle streams (ffprobe) |
| `GET /sprite?path=rel` | — | seek-preview sprite sheet info |
| `GET /subtitle?path=rel&idx=n` / `?srt=rel` | — | WebVTT subtitles |
| `GET /host/session` | — | session state (for the gate UI) |
| `POST /host/setup`, `/host/login`, `/host/logout` | — | password setup & sessions |
| `GET/PATCH /host/panel`, `/host/settings`, `/host/system`, `/host/roots`, `/host/logs` | host | admin panel |

## Project layout

```
server/            Express app, config, activity log, auth, system stats
  routes/          browse · stream · host APIs
  media/           FFmpeg detection, thumbs queue, ffprobe/sprite/subs, cache pruning
public/            client explorer + OTT player + host panel (plain HTML/CSS/JS)
data/              runtime state: config.json, log.jsonl, cache/ (git-ignored)
```

## Roadmap ideas

- Hardware-accelerated HLS transcoding for codecs browsers can't play
- TV-style "Continue watching" rows (local-only, still no accounts)
- Playlist/shuffle for audio

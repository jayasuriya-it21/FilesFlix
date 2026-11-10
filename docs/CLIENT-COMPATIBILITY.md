# FileFlix client compatibility

## Two playback engines

The web application uses HTML media APIs and hls.js. Next Player is an Android
application written in Kotlin, not a JavaScript player library. Its native
engine cannot be embedded in an ordinary web page. Web-player improvements
therefore provide browser-compatible equivalents, not identical codec support.

The Android integration targets Next Player's native playback, phone and TV
interfaces, and existing network-storage support. See the Android client's
documentation for implemented features and build results. A planned feature
is not a tested capability.

## Laptop server

1. Run `npm install` and `npm start` on the laptop.
2. Configure the media folder through `http://localhost:7010/host`.
3. Connect the laptop and client to the same trusted LAN.
4. Enter `http://<laptop-LAN-IP>:7010` on the client. `localhost` on a TV or
   phone means that device, not the laptop.
5. If unreachable, check Windows Firewall (private networks only), Wi-Fi
   client isolation, VPN routing, and the laptop's current IP address.

Do not forward port 7010 to the internet. Viewing endpoints are public to
devices that can reach the server. The host password protects administration,
not library viewing. Plain HTTP does not encrypt media traffic.

## Direct playback versus conversion

Native clients can request `/api/stream?path=<encoded-relative-path>` to receive
the original media with HTTP Range support. This preserves encoded streams;
actual decoding and output depend on the device. Web clients use the existing
delivery planner to choose direct playback, remux, audio conversion, or video
transcoding. Conversion can lose HDR metadata or immersive audio information.

Dolby Vision, HDR10+, Dolby Atmos, DTS, and TrueHD labels describe detected
source content, not guaranteed output. Successful playback requires a supported
codec/profile, Android decoder, display, audio output path, and receiver. An
E-AC-3 track alone is not proof of Atmos. Verify output using the TV/receiver's
signal information, not merely a FileFlix badge.

## Windows shares

SMB is a separate source from FileFlix HTTP streaming. Use the native client's
network-storage interface for Windows shares; browsers cannot directly browse
SMB. Prefer SMB2/SMB3 and a dedicated read-only account. Never enable SMB1 or
publish port 445 to the internet. Do not commit share credentials or include
them in playback URLs or diagnostic logs.

## Repository backups

Before replacing the legacy application, its `main` commit
`1a4834f21ef72647ac1a60701e2695d7e6534e86` was preserved on GitHub as
`backup/pre-fileflix-20261110` and in the verified local bundle
`D:\Documents\Projects\FilesFlix-backup-20261110.bundle`.
The replacement baseline is commit `6942283`; no history rewrite was used.
Runtime passwords, caches, logs, media files, and signing keys are excluded
from new commits. The backup intentionally retains the original history.

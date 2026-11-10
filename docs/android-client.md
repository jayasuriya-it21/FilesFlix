# FileFlix Android & Google TV Client

This document details the native Android client integration for FileFlix, adapting the upstream [NextPlayer](https://github.com/anilbeesetti/nextplayer) project (GPL-3.0) into a native client for Android mobile phones, tablets, and Android TV / Google TV.

---

## 1. Overview & Architecture

The FileFlix Android client is built as an adaptation/fork of NextPlayer under `android-client/`. It combines NextPlayer's native Jetpack Compose multi-module architecture, ExoPlayer/Media3 media engine, and native network protocols (SMB, FTP, SFTP, WebDAV) with direct HTTP REST browsing and streaming against the FileFlix laptop server.

### Key Capabilities
- **Dual Form-Factor Support**: Single multi-flavor APK that supports touch on Android mobile/tablet devices and remote D-pad navigation on Android TV / Google TV (`android.software.leanback` + `android.hardware.touchscreen` optional flags; `LEANBACK_LAUNCHER` intent filter; TV banners).
- **Direct HTTP Playback**: Direct HTTP byte-range streaming (`/api/stream?path=...`) powered by Media3 `DefaultDataSource`, bypassing transcoding for formats supported natively by Android decoders and FFmpeg extensions.
- **Sidecar & Embedded Subtitles**: Integration with FileFlix's `/api/subtitle` endpoint supporting both sidecar `.srt`/`.vtt` files and embedded subtitle tracks converted to WebVTT.
- **Retained Upstream Network Capabilities**: Native NextPlayer network backends (SMB2/3 via `smbj`, WebDAV via `sardine-android`, FTP via `commons-net`, SFTP via `sshj`) are preserved in source; device/network interoperability remains unverified.
- **Persistent Server Configuration**: FileFlix server URL is validated against the `/api/config` endpoint and persisted across app restarts using Android Jetpack DataStore (`ApplicationPreferences`).

---

## 2. Server Integration & Endpoints

The native client communicates directly with the FileFlix laptop server over Wi-Fi/LAN:

| Endpoint | Method | Client Usage |
|---|---|---|
| `/api/config` | `GET` | Validates connection and fetches library root folder name (`{hasMedia, rootName}`). |
| `/api/browse?dir=<rel>` | `GET` | Retrieves folder contents, including nested directories, files, MIME categories (`video`, `audio`), file sizes, modified timestamps, and pre-cached codecs (`sourceFormats`). |
| `/api/search?q=<query>` | `GET` | Real-time global library search across the media root. |
| `/api/meta?path=<rel>` | `GET` | Fetches container metadata, stream durations, audio tracks, and embedded subtitle tracks. |
| `/api/stream?path=<rel>` | `GET` | Streams media binary via HTTP `Range: bytes=start-end` requests (`206 Partial Content`). |
| `/api/subtitle?srt=<rel>` | `GET` | Serves external sidecar subtitles converted on-the-fly to WebVTT (`text/vtt`). |
| `/api/subtitle?path=<rel>&idx=<index>` | `GET` | Extracts and serves embedded subtitle track as WebVTT. |
| `/api/thumb?path=<rel>&mt=<mtimeMs>` | `GET` | Loads server-generated video thumbnails via Coil `AsyncImage`. |
| `/api/poster?name=<filename>` | `GET` | Loads online movie/show poster metadata when matched. |

---

## 3. Remote D-Pad Navigation & Google TV Integration

The client includes remote D-pad navigation support for Android TV and Google TV devices. Complete remote journeys still require device testing:

1. **Focus Ring & Visual Hierarchy**:
   - Every interactive item utilizes NextPlayer's custom `.tvFocusRing()` modifier, providing high-visibility focus borders and scale transitions when highlighted by a remote control.
   - List containers utilize `.tvListFocus()` to ensure smooth directional scrolling and scroll-into-view behavior without jumping.
2. **Key Handling**:
   - Directional keys (Up, Down, Left, Right) navigate across the top app bar, breadcrumb chips, and media items.
   - D-pad Center / Enter triggers folder drill-down or starts media playback.
   - Remote Back button steps back through breadcrumb history or exits to the primary media screen.
3. **Dedicated TV Launch Affordance**:
   - Manifest declares `android.intent.category.LEANBACK_LAUNCHER` with high-resolution banner `tv_banner` (320x180 px) for the Google TV home screen row.

---

## 4. Playback Pipeline & NextPlayer Player API

Playback is dispatched to NextPlayer's `PlayerActivity` using the standard `PlayerApi` VIEW intent contract:

```kotlin
val intent = Intent(context, PlayerActivity::class.java).apply {
    action = Intent.ACTION_VIEW
    setDataAndType(streamUri, if (isAudio) "audio/*" else "video/*")
    putExtra("title", entry.name)
    putExtra(PlayerApi.API_TITLE, entry.name)
    if (playlistUris.isNotEmpty()) {
        putExtra("video_list_is_explicit", false)
        putParcelableArrayListExtra(PlayerApi.API_PLAYLIST, ArrayList(playlistUris))
        putExtra("video_list.name", playlistNames.toTypedArray())
    }
    if (subUris.isNotEmpty()) {
        putExtra(PlayerApi.API_SUBS, subUris.toTypedArray())
        putExtra(PlayerApi.API_SUBS_NAME, subNames.toTypedArray())
    }
}
context.startActivity(intent)
```

### Media3 Data Source Routing
- `NextDataSourceFactory` uses `SchemeDispatchingDataSource`:
  - `smb`, `ftp`, `sftp`, `webdav`: routed to custom socket-based protocol streams.
  - `http`, `https`: routed directly to Media3's `DefaultDataSource`, allowing native chunked range streaming with zero client-side proxying overhead.

---

## 5. Build Environment & Verification

### Build Prerequisites
- **JDK**: Java 21 LTS (`OpenJDK 21.0.10+7-LTS`).
- **Android SDK**: API 37 Platform (`platforms/android-37`), Build-Tools `36.0.0` / `37.0.0`.
- **Gradle**: 9.9.0 wrapper with Android Gradle Plugin 9.5.1.

### Build Commands
From the `android-client/` directory:

```bash
# Build all debug APK variants
./gradlew assembleDebug

# Run unit tests
./gradlew test

# Run targeted network and FileFlix tests
./gradlew :feature:network:test
```

### Test Results
- Parent verification: `:app:assembleDebug :feature:network:test :app:test ktlintCheck` **passed** on Windows using the installed JDK 21. JDK 17 recommended by the upstream contributor guide was not available locally.
- Full `test` suite **failed**: four `GetFolderTreeMediaUseCaseTest` cases, `PlaylistDetailViewModelTest.fileRefreshReplacesItemsAndPreservesSavedName`, and `M3UParserTest.readsAbsoluteFileUri`. These are outside the new FileFlix-specific test suite; their cause has not been established. Do not treat this build as fully validated.
- Device verification **not run**: no connected ADB device and no emulator executable installed at the configured SDK path. TV focus, playback, passthrough, and SMB must be checked on real hardware or an emulator before release.
- `:feature:network:test`: 70 tests completed, **0 failures** (includes `FileFlixClientTest` suite testing URL normalization, endpoint generation, MockWebServer responses for `/api/config`, `/api/browse`, and `/api/search`).
- `:app:test`: 32 tests completed, **0 failures** (includes top-level navigation, playlist shortcuts, and lifecycle tests).

### Generated APK Artifacts
Located in `android-client/app/build/outputs/apk/debug/`:
- `app-universal-debug.apk` (95.16 MB) — Contains all native ABIs (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) for universal deployment on emulators, phones, tablets, and Google TV devices.
- `app-arm64-v8a-debug.apk` (50.93 MB) — Modern 64-bit ARM mobile phones, tablets, and streaming boxes (e.g. Nvidia Shield, Chromecast with Google TV 4K).
- `app-armeabi-v7a-debug.apk` (49.68 MB) — 32-bit ARM streaming sticks and budget TVs.
- `app-x86_64-debug.apk` (55.08 MB) — 64-bit Android Virtual Device (AVD) emulators.
- `app-x86-debug.apk` (52.43 MB) — 32-bit AVD emulators.

---

## 6. Audio & Format Compatibility Notice

- **Direct Native Playback**: The client streams original container bytes directly from the laptop server without re-encoding or transcoding when codecs are supported by the client device.
- **Dolby / Surround Passthrough Disclaimer**: Audio playback capability (including Dolby Digital / AC-3, E-AC-3 / Dolby Digital Plus, TrueHD, DTS, multichannel PCM) is governed entirely by the physical playback device's hardware decoders, HDMI sink ARC/eARC capabilities, and the Android OS audio routing layer. The application does not falsely claim universal hardware passthrough where unsupported by the target device.

---

## 7. Third-Party Notices & GPL-3.0 License Compliance

This client incorporates and adapts source code from [NextPlayer](https://github.com/anilbeesetti/nextplayer), licensed under the **GNU General Public License v3.0 (GPLv3)**:

- **Original Author**: Anil Beesetti
- **License**: GNU General Public License v3.0 (see `android-client/LICENSE`)
- **Source Disclosure**: In adherence to the GPLv3, complete source modifications and adaptations under `android-client/` remain open under the same terms.
- **Third-Party Libraries**: smbj (Apache 2.0), sardine-android (Apache 2.0), sshj (Apache 2.0), commons-net (Apache 2.0), Coil (Apache 2.0), OkHttp (Apache 2.0), Media3 (Apache 2.0).

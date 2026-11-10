# Web player

The web player uses HTMLVideo and the vendored, lazy-loaded hls.js. It does not
embed NextPlayer, Media3, or an Android playback engine. Controls are independently
implemented browser equivalents; no NextPlayer GPL source was copied.

## Controls

- Playback settings: speed (0.5–2×), Fit, Fill (cropped edges), Original size,
  playback mode information, and available alternate audio tracks.
- Subtitles: available embedded text/external WebVTT or SRT, size (75–150%),
  and timing in 0.5-second steps (±30 seconds). Positive delay shows text later.
- Touch: double-tap either half to skip 10 seconds; drag horizontally across the
  picture to preview a seek and release to commit. Gestures ignore controls,
  menus, and messages. Vertical touch gestures are not repurposed.
- Lock button in the top bar prevents accidental playback/seek changes. The
  independent “Unlock controls” button stays visible and keyboard accessible.
  Escape unlocks first; the next Escape follows normal fullscreen/close behavior.
- Space/K or a media play/pause key toggles playback. Left/right on the picture
  seek 10 seconds. Down/up on the picture enter the lower/top controls; arrows
  on a focused button move through controls, and up/down in menus select items.
  Enter/Space activates a button. Tab/Shift+Tab stays within the player.
  Left/right adjust the volume range; up/down move between controls. M mutes, F toggles fullscreen, C opens
  subtitles. Home/End and modified browser shortcuts are not intercepted.
- Picture in picture appears only when supported and reports a useful message
  if the browser rejects it.

## Persistence and performance

Volume, mute, speed, video sizing and subtitle size are stored locally in this
browser. Resume history is limited to the 100 most recently saved file paths.
Positions are saved at most every five seconds during playback, and on pause,
close, file changes, hidden-page and pagehide events. Files under 10 seconds in,
ended files, or positions within 15 seconds of completion start from the beginning.
Resume uses virtual file time, not the restarted HLS segment clock. Storage
failures do not prevent playback. Clearing browser site data clears preferences
and history. History contains local relative filenames; it is not synchronized.

The existing prepare-request AbortController ordering, audio switching, FFmpeg
input-seek restart offsets, seek previews, and HLS media clock starting at zero
are retained. Touch preview does not restart the encoder until release.

## Browser limits

Codec, HDR, Dolby Vision/Atmos, hardware decode, volume, fullscreen and PiP
support depend on the browser, OS and output device. There is no guarantee of
HDR/Dolby preservation or a native-player equivalent decode path. Transcoding
may change fidelity; remuxing does not make unsupported codecs decodable.
Image-based subtitles still require another player. WebVTT styling varies by
browser, especially native fullscreen/PiP. Delay adjusts loaded cues against
their original times and corrects fractional HLS seek offsets; cues already
discarded by server offset clipping cannot be recovered near a restarted stream's
beginning. Delay resets per file; text timing cannot adjust burned-in subtitles.
OS media-session integration, brightness/OS volume gestures, casting and native
track renderers are not implemented. A screen lock cannot block OS/browser UI.

## Verification

Run `node test-web-player.js` and `node test-player-request.js` for the web-specific
logic and cancellation regressions. The other root `test-*.js` scripts cover
server playback and library regressions. Unit tests do not establish codec or
rendering support. Manually check 320/768/1440px, real touch/TV input, lock/unlock,
subtitle timing across HLS restarts, PiP rejection, and focus visibility in the
target browsers before release.

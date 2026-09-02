# SMOOSH

Live video-datamoshing and motion-transfer instrument. Two videos keep moving. **A** supplies pixels. **B** supplies motion. B’s estimated motion field drags A’s imagery through a persistent GPU feedback buffer until the picture melts, trails, and remaps.

This is not a blend, a CSS filter, or a frozen frame with noise on top.

## A: PIXELS / B: MOTION

- **A: PIXELS** continuously injects current moving imagery (upload, recorded clip, still, live camera, or built-in demo).
- **B: MOTION** is downsampled to a luminance field. A Lucas–Kanade optical-flow solve estimates **direction and magnitude**. That field warps the previous output. Old pixels stay until SOURCE REFRESH and PERSISTENCE let them die.

If something moves left in B, leftover A imagery is pulled left in that region.

All processing is local. Files never leave the device. Object URLs, camera tracks, audio nodes, textures, and animation frames are cleaned up when you replace or clear a source.

## Modes

1. **Moving Transfer** — default. Live A in, live B motion, ping-pong feedback.
2. **Cross-Smoosh** — two feedback layers: B warps A, A warps B. The balance control is motion-dependent contamination, not an opacity mix of the two videos.
3. **Freeze & Infect** — freeze A on the current frame while B keeps deforming the buffer. Unfreeze resumes A injection without resetting the mosh.
4. **Self-Mosh** — one source distorts its own previous frames.
5. **Buffer Abuse** — bounded ring of recent A frames (8 on phones, 12 on desktop). Hold, forward, backward, ping-pong, random, then release into live motion.

**RAW CODEC MOSH — EXPERIMENTAL** is listed and **disabled**, on purpose. Real compressed-frame datamoshing means rewriting an H.264/HEVC bitstream (delay/drop I-frames, keep predicted P-frames). WebCodecs decode→encode rebuilds a clean GOP; it is not codec corruption. Bundling FFmpeg/WASM would add tens of megabytes, need cross-origin isolation, and fight the live GPU engine for iPhone memory. There is no fake shader labeled as raw codec moshing.

## Controls

| Control | What it drives |
| --- | --- |
| SOURCE REFRESH | Mix of current A into the warped feedback (`uRefresh`) |
| PERSISTENCE | Multiplier on sampled history (`uPersist`) |
| MOTION GAIN | Scale of decoded flow vectors (`uGain`) |
| MOTION SENSITIVITY | Confidence gate in the temporal-smooth pass (`uSens`) |
| BLOCK SCALE | Motion-map resolution (coarser blocks) |
| CLEAN BLEED | Mix of undamaged current A (`uBleed`) |
| FEEDBACK ZOOM / ROTATION | Cumulative lookup transform |
| EDGE TEAR | Offset along flow-gradient boundaries |
| RGB SPLIT | Chromatic sample offset along flow |
| CROSS-MOSH BALANCE | Mix of the two warped feedback layers |

Transport: play/pause both, pause A or B, swap roles, freeze, reseed from current A, clear feedback, loop/speed/in-point per clip, fill/fit, mirror, front/rear camera, reset, randomize, local presets.

Changing sliders does not reload videos or wipe the buffer.

## Recording

The **processed canvas** is captured (`captureStream` + `MediaRecorder`). Audio is mixed with Web Audio (A, B, A+B, or mute; default B).

Format is chosen with `MediaRecorder.isTypeSupported()`:

- Safari / iOS often: **MP4 / H.264**
- Chrome / Firefox often: **WebM / VP8 or VP9**
- A WebM blob is never named `.mp4`

Preview, download, and share the take. If the browser cannot record, the live instrument still runs and the UI says so.

Output aspect: 9:16, 1:1, 16:9, or source. Quality: Performance (default on phones), Balanced, High. High is the first preset that allocates large framebuffers. Device-pixel-ratio is capped.

## Privacy

No backend, no accounts, no analytics, no CDN runtime scripts. Presets are tiny JSON in `localStorage`. Uploaded media stays as object URLs in RAM.

## Browsers

Best: Safari 15+ (iPhone, the primary target), Chrome, Edge, Firefox. Needs **WebGL2**, `playsinline` video, and HTTPS for camera/mic.

Known mobile limits:

- Only **one** live camera stream at a time
- Camera/mic require a tap, then the OS permission sheet
- iOS recording format depends on Safari’s MediaRecorder support
- Some in-app browsers block `getUserMedia`
- MOV playback depends on the OS decoder
- Keep Quality on Performance if the phone gets warm

## Develop

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Preview in this environment is served on port 8080.

## Netlify

```
Build command: npm run build
Publish directory: dist
```

`netlify.toml` adds the SPA fallback. This app is a client-side WebGL instrument; no functions or keys required. Cross-origin isolation headers are **not** enabled (they are only needed for SharedArrayBuffer / WASM ffmpeg, which we do not ship).

## Live motion-feedback vs raw codec moshing

- **Live SMOOSH** estimates optical flow on the GPU and warps a ping-pong framebuffer while both videos play. That is the product.
- **Raw codec moshing** tampers with compressed predicted frames. It is a different algorithm, usually offline, and is not faked here.

Demo sources boot automatically so you can see both videos moving without uploading anything. Replace them with your own files whenever you want.

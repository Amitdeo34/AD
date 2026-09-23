# Reel: Continental GT 650 vs Ninja 300

A 9:16 Instagram Reel (1080×1920, 30 fps, H.264 + AAC) for Indian motorcycle
fans. It has an energetic Indian-English male voiceover, kinetic yellow and
white captions, and motion-graphics visuals of both bikes.

| File | What it is |
| --- | --- |
| `out/gt650-vs-ninja300.mp4` | The finished reel, ~45 s |
| `out/gt650-vs-ninja300.srt` | Caption file, if you want Instagram's own captions |
| `out/cover.png` | Cover frame (the split-screen "WHICH TWIN?" shot) |

## Rebuild

```bash
pip install pillow numpy scipy imageio-ffmpeg edge-tts
python3 voiceover.py      # narrator clips + word timings -> build/vo/
python3 build.py          # renders out/gt650-vs-ninja300.mp4
python3 build.py --stills 3 20   # quick preview frames -> build/still_*.png
```

`voiceover.py` uses Microsoft Edge's neural TTS (`en-IN-PrabhatNeural`, +38%
rate). Behind a TLS-intercepting proxy, set `SSL_CERT_FILE` to the proxy's CA
bundle. Scene lengths come from the narrator's word timings, so each cut lands
on the voice. Changing a line in `SCENES` re-times the whole reel.

## Timeline (as rendered)

| # | Time | Visual | On-screen text |
| - | ---- | ------ | -------------- |
| 1 | 0.0–6.1 s | Rapid GT/Ninja cuts, then a red/green split screen with a VS badge | **BOTH ~₹3.5 LAKHS... WHICH TWIN?** |
| 2 | 6.1–14.6 s | GT 650 in a slow studio push-in with a light sweep and floor reflection | CONTINENTAL GT 650 · 650CC · 52 NM TORQUE · labels for twin exhausts, clip-ons and café racer soul |
| 3 | 14.6–19.8 s | GT 650 accelerating along a sunset road, with a speedo, torque bar, exhaust smoke and screen shake | LOW-END GRUNT · MUSCLE-CAR PULL · RUMBLE! |
| 4 | 19.8–26.6 s | Ninja 300 on a winding road, with a dutch-angle lean and green speed streaks | NINJA 300 · 300CC · LIQUID-COOLED · JAPANESE PRECISION |
| 5 | 26.6–32.9 s | Tachometer sweeps to 11,000 RPM with a shift light, then the Ninja cornering | -35 KG LIGHTER · TRACK WEAPON |
| 6 | 32.9–39.2 s | Split screen alternating between the bikes, then the verdict stamps | **TORQUE vs HIGH-REV?** · GO GT! · GO NINJA! |
| 7 | 39.2–45.1 s | Call to action: comment bubble, both bikes nose to nose, animated follow button | WHICH TWIN SOUNDS BETTER? · + FOLLOW → FOLLOWING ✓ |

Audio: a 126 BPM beat plus synthesized twin-cylinder engines. The GT uses a
lumpy 270° crank sound and the Ninja a high-revving scream that follows the
tachometer. All of it ducks under the voice, with whooshes on the cuts and
hits on each spec reveal.

## Swapping in real footage

The bikes are illustrations, not filmed clips. No licensed HD footage of either
bike was available to build with, and footage pulled from YouTube or brand
sites would put the account at risk of copyright strikes. To cut the reel with
real B-roll, use this shot list with the same voiceover and captions:

1. **0–6 s**: GT 650 and green Ninja 300 in rapid 0.2 s cuts, then a
   top/bottom split.
2. **6–14.6 s**: GT 650 at 50% slow motion, with close-ups of the twin
   peashooter exhausts, the clip-ons and the café seat cowl.
3. **14.6–19.8 s**: GT 650 on an open highway from a low tracking shot, pulling
   hard from low revs.
4. **19.8–26.6 s**: Ninja 300 leaning through ghat-road hairpins, drone or
   chase camera.
5. **26.6–32.9 s**: Ninja 300 tachometer sweeping to 11k, then a quick
   cornering shot.
6. **32.9–39.2 s**: The bikes parked side by side, alternating 0.3 s cuts.
7. **39.2–45 s**: A hero shot of both bikes for the follow CTA.

Place your clips under the rendered captions (`out/gt650-vs-ninja300.srt`), or
replace a scene function in `build.py` with frames read from your clip.

## Facts used

- Both are priced around ₹3.2–3.5 lakh ex-showroom, and both have
  parallel-twin engines.
- GT 650: 648 cc air/oil-cooled, 52 Nm, roughly 212 kg kerb weight.
- Ninja 300: 296 cc liquid-cooled, peak power at 11,000 rpm, roughly 179 kg.
  That is about 35 kg less than the GT.

Check current prices before posting, because Indian ex-showroom prices change
often.

Fonts: Anton and Bebas Neue (SIL Open Font License, `assets/fonts/OFL.txt`).

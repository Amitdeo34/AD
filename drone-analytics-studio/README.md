# Drone Analytics Studio

Turns raw drone footage into a finished **progress video (MP4)**, an **editable PowerPoint** and **share-ready PNG stills**, all from one screen. The whole thing runs **on your own computer**, so 4K/5K drone clips are read straight from the pen drive, SSD or folder and are **never uploaded anywhere**.

Without this tool, the work looked like this:

> save frames → paste into PPT → draw area boxes → write status & concerns → export PPT as clips → fit everything again in DaVinci Resolve

With the studio, the same report takes these steps:

> point to the drone folder → scrub a clip → **freeze & mark up** → fill building status once → **Export** (MP4 + PPTX + stills)

The freeze-frame, the reveal animation, the zoom, the fades, the dashboards and the PPT are all generated for you. DaVinci Resolve is not needed.

---

## What you get

| | |
|---|---|
| 🎥 **Clip trimmer** | Filmstrip scrubber, frame-step (← →), set IN / OUT (I / O). |
| ◆ **Freeze-frame analysis** | Press **F** on any frame. The video freezes on that exact frame and your marks animate in, with a slow zoom. Then the footage continues from the same frame. |
| ⬠ **Area demarcation** | Draw building or area outlines: a polygon by clicking corners, or a rectangle. Link each one to a building and its **stage, % progress and floors appear automatically** on the label. |
| 🔴 **Critical highlight** | Mark a building *critical* and it turns red with a pulsing outline and hatch, everywhere it appears. |
| ◉ **Concern markers** | Red marker dot with a label, linked to the concern list (C1, C2, …). The numbering stays consistent across the video and the PPT. |
| 📝 **KEY HIGHLIGHTS panel** | The numbered points (01, 02, …) per frame, animated in one by one. |
| 📊 **Auto dashboards** | Animated building status summary (overall %, stage counts, progress bars), concerns cards and a milestone timeline, all built from your lists. |
| ◧ **Before / After** | Last month vs this month with an animated wipe. |
| 🎨 **Two styles** | **Corporate**: brand-colour boxes, dashed blue areas, red markers, the classic client look. **Cinematic**: dark glass cards and glow outlines. Brand, label, outline and marker colours are all configurable, and your logo is supported. |
| 📋 **Paste from Excel** | Buildings, concerns and milestones can be pasted straight from your tracker sheet. |
| ↻ **Next survey** | Starts next month's report with the same buildings, concerns, milestones and branding. |
| ⬇ **Export** | MP4 from the original full-quality footage (720p / 1080p / 4K, optional background music, NVIDIA/Intel GPU encoding). PPTX with editable text and tables. PNG stills for WhatsApp and email. |

---

## Install (one time)

You need **Python 3.9 or newer**. Download it from <https://www.python.org/downloads/>.
On Windows, **tick “Add python.exe to PATH”** in the installer.

FFmpeg does **not** need a separate install: a working copy comes with the `imageio-ffmpeg` package. If FFmpeg is already on your PATH (e.g. with NVIDIA NVENC), the studio uses that one instead.

### Windows
1. Download this folder (`drone-analytics-studio`), e.g. *Code → Download ZIP* on GitHub, and extract it.
2. Double-click **`START-Windows.bat`**.
   The first run sets everything up in about 1–2 minutes and needs internet once. After that, double-click it any time.
3. The studio opens in your browser at <http://127.0.0.1:8765>. Use **Chrome or Edge**.
   Keep the black window open while you work; closing it stops the studio.

### macOS / Linux
```bash
cd drone-analytics-studio
./start-mac-linux.sh
```

### Manual
```bash
pip install -r requirements.txt
python studio.py              # --port 9000   --data D:\DroneStudio   --no-browser
```

---

## Daily workflow

1. **Home → New survey report.** Enter the name, site, date and survey label, and choose the folder the drone operator gave you. You can also click **✨ Open the demo project** to try everything on a sample site first.
2. **Media tab.** Every video and photo in the folder appears; sub-folders like `DCIM/100MEDIA` are scanned too.
   4K and H.265 clips automatically get a light *preview copy* so scrubbing stays smooth. The **export always uses the originals**.
   Press **＋** on a clip, or **⚡ Add all clips**.
3. **Select a clip.** Scrub to the moment you want and press **◆ Add analysis here (F)**.
4. **Mark up the frozen frame:**
   - **⬠ Area (P).** Click around a building, then double-click to finish. In the inspector, pick the **Building**. Its stage, progress and floors show on the label.
   - **◉ Concern marker (C).** Click the exact spot, then link it to a concern or create one from it.
   - **➚ Arrow (A)** and **T Text (T)** for anything else.
   - Fill in the **Area name** (top-right box) and the **Key highlights**.
   - Drag shapes, corners, labels or red markers to fine-tune. **▶ Play animation** shows exactly how it will look.
5. **Buildings / Concerns / Milestones tabs.** Update the status (or paste from Excel). Every label, dashboard and PPT table updates automatically.
6. **▶ Preview** plays the whole video. **⬇ Export** makes the **MP4**, **PPTX** and **PNG stills**, saved to the project's exports folder. Click **Open folder** to see them.

**Shortcuts:**
- `Space` play/pause
- `← →` frame step (`Shift` = 1 s)
- `I`/`O` in/out
- `F` freeze & analyse
- `S` save the full-resolution frame
- `V P R A C T` tools
- `Del` delete a mark
- `Ctrl+Z`/`Ctrl+Y` undo/redo

---

## Tips

- **Same view every month.** Fly the same DJI *Waypoint* mission each survey. The **Before / After** wipe then lines up perfectly.
- **Logo.** Put a transparent PNG of the logo in the media folder, then choose it in **Project → Logo**.
- **Music.** Drop an `.mp3` into the media folder and pick it in **Project → Background music**. It fades in and out automatically.
- **Faster export.** In **Project → Video output**, choose *Draft* quality for a quick review copy, or choose an *NVIDIA / Intel GPU* encoder if your PC has one.
- **Full-resolution frames.** Press `S` in the clip viewer to save the exact original frame (e.g. 5472×3078) as PNG. This is handy for print reports.
- **Use it from another PC on the office network.** Run `python studio.py --host 0.0.0.0` and open `http://<this-pc-ip>:8765`. The footage still stays on the PC running the studio.

## Where things are stored

```
drone-analytics-studio/
  workspace/                 ← created on first run (safe to back up)
    projects/<project>/project.json      your project (auto-saved, 30 rolling backups)
    projects/<project>/exports/          MP4, PPTX, stills, saved frames
    cache/                               preview copies & thumbnails (safe to delete)
```
Your drone media folder is only **read**; the studio never modifies or moves your footage.

## Troubleshooting

| Problem | Fix |
|---|---|
| *“FFmpeg not found”* | Run `pip install imageio-ffmpeg`, or just re-run `START-Windows.bat`. |
| A clip shows *Loading video…* forever | Wait for the *proxy %* badge on the media card to finish. That preview copy plays in every browser. |
| Folder *Browse…* does nothing | Paste the folder path into the box instead (e.g. `D:\Drone\Oct-2026`). |
| Port already in use | Run `python studio.py --port 9000`. |
| Export is slow | Choose *Draft* quality or 720p for reviews. A GPU encoder helps for 4K. Rendering speed depends on the CPU. |

## How it works (for the curious)

- `studio.py` starts a small local web server (Python standard library only) bound to `127.0.0.1`.
- `engine/media.py` probes clips, makes thumbnails, exact frame grabs and H.264 preview proxies with FFmpeg.
- `app/js/render.js` is the single renderer. The live preview, the editor, the PPT images and every designed video frame come from the same code, so **what you see is what you export**.
- `engine/render.py` cuts the original footage with FFmpeg and adds the branding overlay. It encodes the browser-drawn frames (title, freeze-frame analysis, dashboards) with identical settings and joins everything losslessly, adding music if chosen.
- `engine/pptx_export.py` builds the PowerPoint with `python-pptx`. Analysis frames are images; titles, tables and observations are native, editable PowerPoint.
- `tools/make_demo.py` paints a synthetic construction site and renders demo “drone” clips, so you can try the studio without real footage.

Fonts: Inter (SIL Open Font License, see `app/fonts/OFL-Inter.txt`).

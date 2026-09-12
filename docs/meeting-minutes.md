# Review Meeting Minutes Generator

A single, self-contained HTML page that records a review meeting by voice, turns it into
crisp English minutes, and exports Word, Excel and PowerPoint files in KPMG India colours.

**File:** `public/meeting-minutes.html`

## How to use it

* **Offline / on a laptop** — double-click the file, or open it with `File → Open` in Chrome or Edge.
* **Through the app** — with `npm run dev` running, open <http://localhost:3000/meeting-minutes.html>.

Steps on the page:

1. **Meeting details** — title, date, time, venue, chair, attendees, agenda, next review date.
2. **Capture the review** — three ways, mixable in one meeting:
   * **Live microphone** — tick every language the meeting will use, tap one to point the mic at it,
     and tap another whenever the speaker switches (the recogniser restarts by itself). Each line's
     language is also detected from its script, so a Hindi sentence is treated as Hindi even if the
     mic was left on Odia.
   * **Record & auto-transcribe** — record the meeting audio in the page, then press
     **Transcribe to English**. No language switching at all: Whisper detects each language itself
     and writes English.
   * **Upload a recording** — drop in a Teams / Zoom / phone recording (MP3, WAV, M4A, OGG, WebM,
     MP4, MOV). It is transcribed to English and the minutes are generated automatically.

   Transcription model: **tiny** (~38 MB, fastest), **base** (~73 MB, default) or **small**
   (~237 MB, best for Indian languages). Downloaded once from the browser, then it works offline.

3. **Captured points** — edit, re-tag the speaker, or delete any line.
4. **Generate minutes** — the page translates to English, removes fillers, shortens each line
   and sorts it into summary, discussion, decisions, action items (owner / due date / priority),
   risks and next steps. Every line stays editable.
5. **Export** — Word (`.docx`), Excel (`.xlsx`, three sheets: Minutes, Action Items, Transcript),
   PowerPoint (`.pptx`), or Print/PDF. **Save project (.json)** keeps the whole session for later.

## Languages

Input: English, हिन्दी (Hindi), বাংলা (Bengali), ଓଡ଼ିଆ (Odia), తెలుగు (Telugu), தமிழ் (Tamil) — in any
mix, in the same meeting. Output is always English.

Speech recognition uses the browser's own service (Chrome / Edge). Translation uses Chrome's
built-in on-device translator (Chrome 138+). The first time a language is used, press
**Enable offline translation** once to download its model; after that it works offline.
If a language is not offered by the browser, the original wording is kept and the page says so,
so it can be edited into English before exporting.

## Notes

* The `.docx`, `.xlsx` and `.pptx` files are written as OOXML packages by a small ZIP writer inside
  the page — no libraries, no build step.
* The only network use is the first download of the Whisper model (from jsDelivr and Hugging Face)
  when a recording is transcribed. The audio itself never leaves the device.
* Nothing is uploaded anywhere — transcript, minutes and exports stay on the device.
  Work in progress is kept in `localStorage` so a reload does not lose the meeting.

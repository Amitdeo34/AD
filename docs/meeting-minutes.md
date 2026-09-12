# Review Meeting Minutes Generator

A single, self-contained HTML page that records a review meeting by voice, turns it into
crisp English minutes, and exports Word, Excel and PowerPoint files in KPMG India colours.

**File:** `public/meeting-minutes.html`

## How to use it

* **Offline / on a laptop** — double-click the file, or open it with `File → Open` in Chrome or Edge.
* **Through the app** — with `npm run dev` running, open <http://localhost:3000/meeting-minutes.html>.

Steps on the page:

1. **Meeting details** — title, date, time, venue, chair, attendees, agenda, next review date.
2. **Record the review** — pick the speaking language, press **Start recording** and speak.
   Each finished sentence becomes a captured point with a timestamp and speaker name.
   The language can be switched mid-meeting; the recogniser restarts by itself. Points can
   also be typed in any language, or a transcript can be pasted in.
3. **Captured points** — edit, re-tag the speaker, or delete any line.
4. **Generate minutes** — the page translates to English, removes fillers, shortens each line
   and sorts it into summary, discussion, decisions, action items (owner / due date / priority),
   risks and next steps. Every line stays editable.
5. **Export** — Word (`.docx`), Excel (`.xlsx`, three sheets: Minutes, Action Items, Transcript),
   PowerPoint (`.pptx`), or Print/PDF. **Save project (.json)** keeps the whole session for later.

## Languages

Speech input: English, हिन्दी (Hindi), বাংলা (Bengali), ଓଡ଼ିଆ (Odia), తెలుగు (Telugu), தமிழ் (Tamil).
Output is always English.

Speech recognition uses the browser's own service (Chrome / Edge). Translation uses Chrome's
built-in on-device translator (Chrome 138+). The first time a language is used, press
**Enable offline translation** once to download its model; after that it works offline.
If a language is not offered by the browser, the original wording is kept and the page says so,
so it can be edited into English before exporting.

## Notes

* No libraries, no build step, no network calls. The `.docx`, `.xlsx` and `.pptx` files are
  written as OOXML packages by a small ZIP writer inside the page.
* Nothing is uploaded anywhere — transcript, minutes and exports stay on the device.
  Work in progress is kept in `localStorage` so a reload does not lose the meeting.

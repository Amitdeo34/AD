# Drawing Reader & 4D Schedule Developer

A single-file, offline-first web app that reads construction drawings (PDF / DXF),
pulls quantities out of them, explodes a **group-level programme** into a detailed
location-wise CPM schedule, and exports it to **Primavera P6 (.xer)**, **Excel**,
**MS Project XML** and a **BIM 4D (Navisworks TimeLiner / Synchro) workbook**.

Open `index.html` in any modern browser — no install, no server, no upload.
Your drawings never leave your computer.

*Hinglish:* `index.html` ko browser me kholo. PDF/DXF drawings drop karo, apna group-level
schedule import karo, "Develop schedule" dabao — detailed schedule, Gantt, 4D simulation
aur XER / Excel / BIM file ready.

## The flow

| Step | Screen | What happens |
|---|---|---|
| 1 | Drawings | Drop PDF and DXF files. DXF gives layers, blocks, lengths and areas; PDF gives every text item with its position (sheet no, title, scale, level, marks like `C1`, `D1`, `W1`). |
| 2 | Viewer | Pan/zoom vector viewer, layer toggles, text search, click-to-inspect, distance measure. |
| 3 | Elements & Qty | The extracted BOQ — category, mark, level, zone, quantity, unit, source. Every cell is editable; you can also import a BIM element list (CSV/XLSX) to attach IFC GUIDs. |
| 4 | Group schedule | Import your summary programme: `.xer`, `.xlsx`, `.csv` or MS Project `.xml`. Or load the standard building template. |
| 5 | Rules & Norms | Read rules (CAD layer / text → element category) and work packages (categories, output per crew-day, crews, min/max duration, floor-by-floor flag) plus calendar, zones and overlaps. |
| 6 | Develop | Explodes every group activity into *work package × level × zone* activities, sizes each from the drawing quantity, links them (trade sequence, zone overlap, floor-to-floor, foundation-to-ground) and runs a full forward/backward CPM pass. |
| 7 | Gantt | Bars, total float, critical path, WBS/level/zone grouping; PNG and SVG export. |
| 8 | 4D | Plays the programme against the DXF geometry — elements turn grey → amber → green as the schedule runs. |
| 9 | Exports | XER, Excel workbook, BIM 4D workbook, TimeLiner CSV, MS Project XML, P6 import CSV, project JSON. |

## How durations are produced

```
quantity  = geometry or block/mark count from the drawing  ×  rule factor
duration  = ceil( quantity ÷ (output per crew-day × crews) ),  clamped to min…max
```

Everything in that chain (rules, factors, outputs, crews, calendar, zone overlap) is
editable in the app, and every assumption is written into the *Assumptions* sheet of the
Excel export, so the numbers can be checked and defended.

## Formats

* **DXF** — ASCII DXF (AutoCAD → `SAVEAS → AutoCAD DXF`). Best results: real quantities from geometry.
* **PDF** — vector plots give text; scanned/raster sheets show the image only, so enter those quantities manually in step 3.
* **DWG** — cannot be parsed by any browser. Export DXF or plot a PDF.
* **XER** — written for Primavera P6 (19.12 header): PROJECT, CALENDAR, PROJWBS, TASK, TASKPRED. Review the project calendar after import.
* **BIM 4D** — `TimeLiner` sheet: Task Name, Display ID, Task Type, Planned Start/End, Search Set (`Level_Zone_Package`), level, zone, categories, element marks and GUIDs. Attach in Navisworks with *Auto-Attach Using Rules* on selection-set name.

## Notes

* The page loads pdf.js and SheetJS from a CDN the first time; after that the browser cache keeps it working offline. Without them, DXF reading, the schedule engine and the CSV/XER/XML exports still work — only PDF reading and `.xlsx` writing need the libraries.
* Work in progress is auto-saved to this browser's local storage; **Save** writes a `.json` project file you can reopen or share.
* Press **Demo data** in the header to generate a synthetic G+4 tower and see the whole pipeline end to end.

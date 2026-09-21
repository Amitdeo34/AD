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
| 1 | Drawings | Drop PDF and DXF files. **Every sheet is read on its own** — its level, discipline, sheet number, plot scale, title and grid. DXF gives layers, blocks, lengths and areas; PDF gives every text item with its position. |
| 2 | Viewer | Pan/zoom vector viewer, layer toggles, text search, click-to-inspect, distance measure, and a **grid + zone overlay**. Large drawings switch to a fast view while you pan. |
| 3 | Elements & Qty | The extracted BOQ — category, mark, **level, work area and grid bay**, quantity, unit, sheet, source. Every cell is editable; you can also import a BIM element list (CSV/XLSX) to attach IFC GUIDs. |
| 4 | Grids & Zones | The column grid found on each sheet (A, B, C… / 1, 2, 3…), split into work areas by grid range with their plan area in m², a zone map, and the per-sheet grid/level table. |
| 5 | Group schedule | Import your summary programme: `.xer`, `.xlsx`, `.csv` or MS Project `.xml`. Or load the standard building template. |
| 6 | Rules & Norms | Read rules (CAD layer / text → element category) and work packages (categories, output per crew-day, crews, min/max duration, floor-by-floor flag) plus calendar, fallback zones and overlaps. |
| 7 | Develop | Explodes every group activity into *work package × level × work area* activities, sizes each from that area's own quantity, links them (trade sequence, area-to-area overlap, floor-to-floor, foundation-to-ground) and runs a full forward/backward CPM pass. |
| 8 | Gantt | Bars, total float, critical path, WBS/level/zone grouping; PNG and SVG export. |
| 9 | 4D | Plays the programme against the DXF geometry — each element turns grey → amber → green with the activity of **its own level and area**. |
| 10 | Exports | XER, Excel workbook (with Work areas and Sheets read tabs), BIM 4D workbook, TimeLiner CSV, MS Project XML, P6 import CSV, project JSON. |

## Grid-wise, level-wise, area-wise

* **Grid** — grid bubbles (single letters / 1–2 digit numbers repeated at both ends of a grid line) are clustered into an X axis and a Y axis; if a sheet has no bubbles, long centre lines on grid-ish layers are used instead. Works on DXF geometry and on vector PDF text.
* **Level** — read per sheet from its title block and file name (`GF`, `L3`, `2F`, `B1`, `Foundation`, `Terrace`…). A sheet that says *TYPICAL FLOOR PLAN (L3 TO L12)* is applied to all ten levels automatically. You can override the level for a whole file in step 1.
* **Area** — split the grid into rows × columns of work areas (`A-D / 1-4`), or edit each area's grid range by hand. A sheet whose title says *ZONE A* becomes its own work area.
* **Placing quantities** — counted items (columns, doors, windows, fixtures) go to the area their centre falls in; areas and lengths that span several zones (slabs, floor finishes, walls, ducts) are **split in proportion to the overlap**, so a 30 m slab across an 18 m + 12 m split gives 60 % / 40 %.
* **Fallback** — a sheet with no grid still works: its level quantity is divided equally between the fallback zones set in step 6.

## Reading capacity

Tested in a headless browser on this repo's fixtures:

| Input | Result |
|---|---|
| 20.4 MB DXF, 400,615 entities, 21 × 13 grid | parsed in ~4 s, grid found, 6 work areas split with real m² |
| Multi-sheet PDF set | each sheet read separately — own level, grid, marks; `L3 TO L8` expanded to 6 levels |
| Viewer on the 400k-entity drawing | ~20 ms per frame while panning (fast view), full-quality redraw when you stop |

Parsing is chunked so the page keeps responding and shows progress, and the viewer culls whatever is off-screen or smaller than a pixel. Entity types read: LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, CIRCLE, ELLIPSE, SPLINE, POINT, SOLID, 3DFACE, HATCH, TEXT, MTEXT, ATTRIB, ATTDEF, INSERT (with block length/area totals) and DIMENSION.

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
* **BIM 4D** — `TimeLiner` sheet: Task Name, Display ID, Task Type, Planned Start/End, Search Set (`Level_Zone_Package`), level, work area, grid range, categories, element marks and GUIDs. Attach in Navisworks with *Auto-Attach Using Rules* on selection-set name.

## Notes

* The page loads pdf.js and SheetJS from a CDN the first time; after that the browser cache keeps it working offline. Without them, DXF reading, the schedule engine and the CSV/XER/XML exports still work — only PDF reading and `.xlsx` writing need the libraries.
* Work in progress is auto-saved to this browser's local storage; **Save** writes a `.json` project file you can reopen or share.
* Press **Demo data** in the header to generate a synthetic G+4 tower and see the whole pipeline end to end.

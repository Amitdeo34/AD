# Schedule Engine

Schedule Engine updates a monthly area schedule without Primavera P6. You load last month's
**XER, Excel, CSV, PDF or MS Project XML** file, move the Data Date, and update progress.
Updates can go building-wise, EPC-wise or activity-wise, using dates, % or quantities.
Press **F9** to reschedule, then export a **P6-ready XER** along with
**Excel, PDF, HTML, CSV and MS Project** outputs. The Qty & Liquidation module also produces
building-wise / WBS-wise / EPC-wise **quantity one-pagers** as PowerPoint, PDF and Excel.

It is **one HTML file** that works fully offline: no install, no P6 licence, no upload.

```
dist/ScheduleEngine.html      ← the app. Copy it anywhere and double-click it (Chrome / Edge).
samples/                      ← demo XER + example outputs
```

If this repository is deployed, the same page is served at **`/schedule-engine`**.

---

## Quick start (Hinglish)

1. `dist/ScheduleEngine.html` ko Chrome/Edge me kholo (double-click). Internet ki zarurat nahi.
2. **Open…** → pichle mahine ki `.xer` (ya Excel / PDF / MS Project XML) chuno.
   Try karna ho to **Try the demo project** dabao.
3. Engine naya **Data Date** poochega (default: agle mahine ki 1 tareekh). Set karo.
4. Left side **Update spotlight** batata hai kya update karna hai:
   - *Should have started - not started*: plan me start ho jana tha, abhi tak nahi hua
   - *Should have finished - not finished*: finish date nikal gayi, complete nahi hua
   - *Future activity showing progress*: aage ki activity me progress aa gayi (verify karo)
   - *In progress*: har mahine % aur remaining duration update karo
5. **Easy Update** tab: building-wise ya EPC-wise card view. Actual Start / Finish, % aur remaining
   bharo, ya "Started on plan" / "Finished on plan" / "+10%" buttons use karo.
   **Qty…** button: scope vs completed quantity se % nikalo.
6. **F9** dabao (Schedule). Dates, float aur critical path recalculate ho jaate hain.
7. **Health Check** dekho, phir **Export** karo: XER (P6 me import), Excel, PDF, HTML, one-pagers.

Galti se bachane ke rules: Actual date Data Date ke baad nahi ho sakti. 100% ke liye Actual Finish
chahiye. Finish, Start se pehle nahi ho sakta. Complete activity lock rehti hai. Milestone me % nahi
hota. Out-of-sequence aur logic loops flag hote hain.

---

## Features

**Monthly update workflow.** A guided 5-step strip runs Data Date → Update → Schedule (F9) →
Check → Export. A progress ring shows how many of this month's due activities are updated.
Everything autosaves in the browser, so you can close the page and resume later.

**Smart spotlight (lenses).** Each activity is compared with its last-update and baseline dates:
- late start, overdue, future progress
- due this period, in progress, pending update, updated
- critical, negative float, out of sequence, invalid, 4-week look-ahead, open ends

Rows are tinted in the grid and the Gantt. Filters combine building, EPC and status.

**Building-wise / EPC-wise.** Buildings come from an activity code, a WBS level or automatic
detection. EPC (Engineering / Procurement / Construction) comes from a code, a WBS level or
keyword intelligence ("approval of drawings" → E, "supply of cables" → P, "cable laying" → C).
Both can be overridden per activity. Group the schedule by WBS, Building, Building → EPC,
EPC → Building, status, update flag or any activity code.

**Mistake-proof progress rules.**
- Actuals must be before the Data Date.
- 100% needs an Actual Finish.
- Progress needs an Actual Start (auto-filled from the plan and flagged).
- Completed work is locked until re-opened.
- Milestones take dates, not %.
- Remaining duration can follow %.
- An expected finish date converts to remaining duration.

There is undo/redo and a full change log.

**Quantity-based %.** Enter scope, last-update quantity and this month's quantity to get
cumulative done and physical %. Weighted steps (rules of credit) cover RCC, steel, MEP and
engineering. Reaching 100% asks for the Actual Finish.

**P6-style scheduling (F9).**
- CPM with FS/SS/FF/SF relationships, lags and leads.
- Multiple calendars with holidays.
- Retained logic or progress override.
- Constraints: SNET, FNET, Start On, Finish On, SNLT, FNLT, mandatory.
- LOE and WBS-summary activities.
- Must-finish-by date.
- Total and free float, critical path and longest path, loop detection.
- Schedules without logic (Excel / PDF) are updated date-driven.

**P6-like visuals.** The activity table has P6 WBS bands and is virtualised for thousands of
activities; inline editing is keyboard driven (Enter, Tab, arrows). The canvas Gantt has:
- day / week / month / quarter / year timescales
- actual, remaining, critical and baseline bars and milestones
- the Data Date line, relationship lines and hover details

Themes: **KPMG India** (light), KPMG India dark, and Primavera classic.

**Ask the engine.** Type questions like "delayed in Admin Building", "procurement progress",
"critical next 30 days", "how many not started in Warehouse" or "when will the project finish".
The grid filters itself and the engine answers.

**Analysis.**
- Dashboard: S-curve (planned / actual / forecast), building-wise and EPC-wise progress,
  Building × EPC heat matrix, top slipping activities, milestones, written insights.
- DCMA-14 style health check with a score and click-through to the affected activities.
- Changes vs the last update.

### Qty & Liquidation one-pagers

This module follows the layout of a building-structures status deck. Each item is a building or
package with:
- scope, drawings released, supplied, erected and last-month actuals
- a month-wise supply and erection plan
- work fronts, targets and your own concerns

The engine then:
- **liquidates** the balance month-wise: even, S-curve, front/back-loaded, fixed rate, follow the
  linked schedule activity, or erection following supply with a lag and a monthly cap. Totals
  always reconcile to the balance.
- **writes the concerns** itself: plan not reconciled with scope, drawings pending and the month
  cumulative supply crosses drawings released, required dispatch ramp-up vs last month, erection
  exceeding supply, material waiting at site (peak and month), erection rate to hold, targets
  missed. Status (ON TRACK / WATCH / AT RISK / DELAYED) and milestones are derived from these.
- builds one-pagers **building-wise, WBS-wise, EPC-wise, combined or item-wise**, plus a
  combined backup slide with monthly and cumulative supply vs erection charts, a plan table
  and the gaps to close.
- exports **PowerPoint** (native charts, speaker notes), **PDF** and an **Excel workbook**.
  The workbook has Items, Plan, Fronts and Concerns sheets with formulas, validation and
  reconciliation checks, and can be imported back. A **blank template** is available too.
- can be created from schedule quantities, and pushes done ÷ scope back to the linked
  activities' % complete.

### Inputs

| Format | Notes |
| --- | --- |
| `.xer` | Every table is kept. Projects, calendars (work week + holidays), WBS, activities, relationships, activity codes and UDFs are read. Multi-project XERs ask which project to open. UTF-8 and Windows-1252 are both handled. |
| `.xlsx / .xls / .csv` | Column-mapping wizard with auto-detection, including P6 spreadsheet exports (field-name row + label row). Other inputs it understands: WBS band rows or a WBS path column; `A` actual markers; `*` constraints; predecessor text like `A1010FS+2d`; fractional % columns; extra columns imported as activity codes. |
| `.pdf` | Text-based P6 layout prints. Uses the repeated table header, column positions and WBS band rows; the Gantt area is ignored. Scanned images are not supported. |
| `.xml` | MS Project XML (MSPDI): summary tasks, links, baseline and progress. |
| Update Sheet | The orange "New …" columns of the exported Excel, filled offline and imported back with validation. |
| `.sej` | Schedule Engine project file with quantities, remarks and the change log. |

### Outputs

| Format | Contents |
| --- | --- |
| **XER** | For an XER source, progress, dates, float, critical flag, data date and project finish are written back into the **original tables**. Resources, costs, UDFs and codes are preserved, and added / deleted activities and relationships are handled. For other sources a clean XER is generated. Building & EPC can be added as activity codes. In P6: *File → Import → XER → Update existing project*. |
| **Excel** | Sheets: Dashboard, Building × EPC matrix, P6-style Schedule (WBS bands, outline grouping, flags), cell Gantt (weekly / monthly), **Update Sheet** (validation + check formulas), Look-ahead, Attention, Health Check, Change Log, Relationships. |
| **PDF** | Summary page (KPIs, S-curve, building bars, EPC table, insights), P6-style Gantt layout pages, attention list, look-ahead and health check. Pages: A4, A3 or A2. |
| **HTML** | Single-file interactive report: KPIs, S-curve, building/EPC tables, searchable collapsible Gantt. |
| **CSV / MS Project XML** | For other tools. |
| **One-pagers** | PPTX / PDF / Excel from Qty & Liquidation. |

---

## Samples

| File | What it is |
| --- | --- |
| `Demo_Plant_LastMonth_DD_2026-09-01.xer` | Last month's demo schedule. Open it and set the Data Date to 01-Oct-26. |
| `Demo_Update_Workbook.xlsx`, `Demo_Update_Report.pdf`, `Demo_Update_Report.html` | Outputs after an update. |
| `Building_Structures_OnePagers.pptx / .pdf` | Quantity one-pagers (3 buildings + combined backup). |
| `Qty_Liquidation_Filled.xlsx`, `Qty_Liquidation_Template_Blank.xlsx` | Quantity workbook and blank template. |

---

## Developing

```bash
cd schedule-engine
npm test                 # core engine tests (dates, calendars, CPM, rules, XER, lenses, importers, quantities)
npm run build            # → dist/ScheduleEngine.html and ../public/schedule-engine/index.html
npm run sample           # regenerate samples/ (needs pptxgenjs installed for the .pptx)
```

Open `src/index.html` directly while developing; it loads the source files unbundled.

```
src/core/   engine, no UI: base (dates, calendars) · model (activities, rules, undo) · cpm · xer
            analysis (lenses, health, S-curve, insights, ask) · views (grouping) · importers
            exporters · demo · qty (liquidation, concerns, slide layout) · qtyexport
src/ui/     app shell, grid, gantt, panels (details, easy update, dashboard, dialogs), io, qtyview
vendor/     SheetJS, ExcelJS, jsPDF + AutoTable, PDF.js, PptxGenJS (inlined by the build)
```

**Limits to know.**
- Scheduling works in whole working days. Fractional-day durations are rounded up.
- Resource levelling and cost loading are not recalculated; they pass through the XER unchanged.
- A generated XER (from Excel / PDF sources) should be checked in P6 after import.
- PDF import needs a text-based PDF.

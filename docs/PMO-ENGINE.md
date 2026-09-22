# PMO Reporting Engine

Upload the DPR. Get the week's exception report, the area tracking, the interim
paper, the monthly, the quarterly, the digital DPR and the schedule update —
all from the same set of numbers, so they agree with each other in front of a
client.

Two ways to run it:

```bash
npm run pmo:seed && npm run dev     # the served app, at /pmo
npm run pmo:standalone              # dist/pmo-engine.html — one file, no install
```

The standalone file is the whole engine in a single HTML document. Open it from
a desktop on any machine — no Node, no install, no network — and it parses the
workbook, reconciles it and writes the reports in the browser tab. Project data
stays in that browser's own storage and never leaves the machine, which is what
makes it usable on a client site where nothing can be installed. Mail it to a
colleague and it works for them too.

---

## The idea

A PMO spends most of its week re-typing the same figures into seven different
templates, and the templates disagree. This engine inverts that: the data is
loaded once and reconciled once, and each report is a *view* of that one
reconciliation.

```
  uploads ──▶ mapping ──▶ canonical records ──▶ project model ──▶ report pack ──▶ HTML / Excel / Word / CSV
             (learned)      (15 doc types)      (one truth)        (7 types)        (print → PDF)
```

Nothing is hand-keyed between those stages, so the monthly cannot say 38% while
the weekly says 41%.

---

## What you upload

The **DPR is the only thing you must have.** Everything else sharpens the
output, and the cockpit tells you exactly what each missing document would add.

| Document | What it unlocks |
| --- | --- |
| **Daily Progress Report** *(required)* | Everything. Quantities, manpower, plant, weather, hindrances. |
| **Baseline schedule / WBS** | Planned position, S-curve, slippage, critical path, the schedule update. |
| **BOQ** | Value-weighted progress. Without it, a day of survey counts the same as a month of piling. |
| Contract milestones | Milestone watch-list and LD exposure. |
| Risk register | 5×5 scoring, risk trend, the risk section. |
| Issue / action log | Carried-forward actions with ageing and owners. |
| Quality — NCRs | Ageing non-conformances. |
| Safety — incidents | Incident and LTI reporting, frequency rate. |
| Billing / IPC | Financial progress, CPI, certification lag. |
| Cash flow plan | Drawdown against plan. |
| Hindrance register | Constraint ageing and attribution — the backbone of an EOT case. |
| Procurement / materials | Long-lead items against the date site needs them. |
| Drawing register | Design releases holding up the front. |
| Manpower / equipment deployment | Where the DPR does not carry them inline. |

**Formats read:** `.xlsx`, `.csv`/`.tsv`, Primavera P6 `.xer`, MS Project XML,
Primavera XML, JSON, and — best effort — a text-layer PDF. A scanned PDF is
rejected with a plain explanation rather than silently producing nothing.

---

## How the mapping works

No two clients name their columns the same way, so the engine does not ask you
to conform to a template.

1. It finds the header row — including a **merged two-row header**, where
   "Manpower" sits above "Plan | Actual".
2. It matches every column against a dictionary of ~900 spellings, scoring each
   by exact match, word-set match, containment and fuzzy similarity, then
   assigns one-to-one so the strongest claim wins. `Qty (Plan)` and
   `Qty Achieved` land the right way round.
3. It works out what the sheet *is* — DPR, schedule, BOQ and so on — by which
   document type best explains the whole sheet, not just a column or two.
4. You confirm it. **Nothing is stored until you do.**
5. It remembers the mapping against the shape of the header row. The same
   workbook next week arrives pre-mapped, whatever rows it carries.

Values are read the way they were typed: `15/01/26` is day-first, `1,23,456.50`
is Indian grouping, `2.5 Cr` is 25,000,000, `(1200)` is negative, and `45%`,
`45` and `0.45` all mean the same thing. A `TOTAL` row at the foot of the sheet
is recognised and dropped rather than counted twice.

---

## What it works out

**Progress** is weighted by BOQ value where the BOQ reaches, then by the
schedule's own weightage, then by duration, then equally — and every report
states which basis it used.

**Forecast completion** comes from measured productivity: the trailing rate on
each activity, applied to the quantity remaining, then driven through the
programme logic. Where the schedule carries no predecessors, the report says so
rather than inventing a critical path.

**Earned value** gives PV, EV, AC, SPI, CPI, earned schedule, EAC and VAC.
Actual cost is taken as *certified value* — a PMO cannot see the contractor's
cost book, and the report says that too.

**22 exception rules** run against per-project thresholds, covering schedule
slip, stalled and unstarted work, productivity and manpower shortfall,
milestones at risk, ageing hindrances/NCRs/actions, safety incidents, high
risks, drawing and procurement delay, billing lag, cost performance, quantity
overrun, missing DPR days, and work being reported that is not in the
programme. Each one states the measure that triggered it, the owner and the
action. Exceptions are carried period to period, so the pack shows what is
**new**, what is **worsening** and what has **closed**.

**Data assurance** runs before anything is published: duplicated DPR rows,
cumulative columns that go backwards, activities that finish before they start,
work reported outside the programme, missing days. It scores readiness out of
100 and every report carries the qualification.

---

## The seven reports

| Report | Period | For |
| --- | --- | --- |
| **Weekly Exception Report** | Week | What is off-track, who owns it, what happens next. Everything on-track is left out. |
| **Area Weekly Tracking** | Week | The same week cut by area or package, one section each. |
| **Interim Report** | Any dates | A full position for a review, a board paper or a contractual position. |
| **Monthly Progress Report** | Month | The standard MPR, eleven sections. |
| **Quarterly Progress Report** | Financial quarter | Month-on-month trend, matters for decision, outlook. |
| **Digital DPR** | One day | A day digitised and checked, against the cumulative position. |
| **Schedule Update** | To date | Actual dates, remaining durations, float, critical path, slippage — exportable for P6 or MS Project. |

Quarters follow the **Indian financial year** (Apr–Mar), so Q1 FY27 is
Apr–Jun 2026.

Every report comes out as:

- **HTML** — print-ready A4 landscape; the browser's own print dialogue makes
  the PDF.
- **Excel** — every table as its own sheet, with real dates and numbers,
  frozen headers and filters.
- **Word** — a real `.docx`, so a partner can edit it before it goes out.
- **CSV** — the exception register, for pasting into an action tracker.
- **P6 / MSP Excel** — schedule update only, in a column order that pastes back.

And **all seven merged into one document** — one cover, one contents page, each
report starting on its own page when printed. In the served app that is
`?bundle=true` on the report route, or the "Open the complete pack" button; in
the standalone file it is the same button.

---

## Thresholds

Every rule reads a per-project threshold, so a metro viaduct and a hospital
fit-out are not held to the same standard. The defaults live in
`lib/pmo/thresholds.js`; override any of them per project via
`PATCH /api/pmo/projects/{slug}` with a `thresholds` object.

---

## Layout

```
lib/pmo/
  schema.js         15 document types, 166 fields, ~900 column spellings
  thresholds.js     what every exception rule is measured against
  dates.js          reporting calendars, incl. the Indian financial year
  normalize.js      dates, numbers, percentages and money as typed on site
  quality.js        data assurance and the readiness score
  store.js          persistence — the only module that touches the disk
  service.js        storage ⇄ engine
  demo.js           the worked example project
  ingest/
    zip.js          ZIP reader/writer (xlsx and docx are both ZIPs)
    xml.js          the little of XML the Office formats need
    xlsx-read.js    workbooks in
    xlsx-write.js   workbooks out
    codec.js        raw deflate (Node)
    codec.browser.js  raw deflate, written from scratch, for a browser tab
    csv.js          delimited text, sniffed
    pdf-text.js     best-effort text out of a PDF
    tabulate.js     one door for every format, incl. .xer and MSP XML
    pipeline.js     inspect → confirm → commit, with learned mappings
  mapping/
    automap.js      header detection, column matching, doc-type detection
  analytics/
    model.js        DPR + schedule + BOQ reconciled into one set of activities
    cpm.js          forward/backward pass, float, critical path
    metrics.js      earned value, cash, risk, quality, safety, look-ahead
    exceptions.js   the 22 rules
  reports/
    context.js      everything a report needs, computed once
    narrative.js    the prose, derived from the numbers
    blocks.js       the pieces a report is assembled from
    types.js        the seven reports
    index.js        the registry
  store-core.js     what the data *is*, independent of where it is kept
  browser/
    buffer.js       the part of Node's Buffer the binary formats need
    store.js        the same store, over localStorage
    app.js          the framework-free UI of the standalone file
  render/
    charts.js       inline SVG — S-curve, grouped bars, status bars
    html.js         print-ready document, single report or the whole pack
    xlsx.js         workbook
    docx.js         Word document
    format.js       how a value is written, once, for all three

app/pmo/            the screens
app/api/pmo/        the routes
components/pmo/     project list, cockpit, upload wizard, report runner
test/pmo-*.test.js  43 tests over ingest, analytics and the deliverables
```

**No dependencies at all.** The XLSX, DOCX and ZIP handling is written against
Node's own `zlib` on the server, and against a from-scratch RFC 1951 deflate in
the browser — the same files come out either way, and both are verified
byte-for-byte against `zlib` in the tests.

`scripts/build-standalone.mjs` inlines the engine into one HTML file. It is a
small, legible bundler rather than a toolchain: the modules are plain ESM with
named exports and no cycles, so they are wrapped in a registry and required in
order. Two modules exist twice — the deflate codec and the store — and the
browser build takes the second of each.

---

## API

| Route | Does |
| --- | --- |
| `GET /api/pmo/meta` | Document types, report types, default thresholds |
| `GET POST /api/pmo/projects` | List and create |
| `GET PATCH DELETE /api/pmo/projects/{slug}` | Overview, edit, remove |
| `POST /api/pmo/projects/{slug}/upload` | Multipart → inspection; JSON → commit |
| `GET DELETE /api/pmo/projects/{slug}/data` | Uploads, and removing one |
| `GET /api/pmo/projects/{slug}/report` | `?type=&format=&from=&to=&asOf=`, or `?bundle=true` for all seven as one document |

Example:

```bash
curl -O -J "http://localhost:3000/api/pmo/projects/mr-04/report?type=monthly&format=xlsx"
```

---

## Storage

`lib/pmo/store.js` keeps one JSON document, written to `.data/pmo.json`
(`PMO_DATA_DIR` to move it). It is deliberately the only module that touches
persistence, so moving a live PMO onto Postgres means rewriting that one file.

**On a serverless host the writable directory is per-instance and temporary.**
Point `PMO_DATA_DIR` at a mounted volume, or swap the store, before the engine
carries a project you cannot lose.

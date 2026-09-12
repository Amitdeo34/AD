# DPR Consolidator — JSW Utkal Steel

Vendor DPRs arrive in whatever layout each contractor happens to use. This turns a pile of
them into **one Daily Progress Report in your approved format**, with the arithmetic and the
audit trail intact.

Two deliverables, and they work together:

| File | What it is |
|---|---|
| **`DPR_Consolidator_offline.html`** | The tool. One file, opens in Chrome or Edge by double-clicking, **works with no internet at all**. Drop in the vendor files, it maps and matches them, you download the finished DPR. |
| **`JSW_DPR_Template.xlsx`** | The approved format itself, live formulas and all. Use it as the master-scope source for the tool, and as the manual fallback when you would rather type. |

`dpr_consolidator.html` is the same tool but pulling SheetJS and JSZip from a CDN — smaller,
needs internet. Prefer the offline one.

---

## Quick start (Hinglish)

1. **`DPR_Consolidator_offline.html` ko double-click karo.** Koi install nahi, koi internet nahi chahiye.
2. **Step 1** — project ka naam, data date aur reporting date bharo. Phir
   *Load master workbook* se `JSW_DPR_Template.xlsx` (ya kal ka final DPR) upload kar do.
   Master optional hai, par isse scope, area aur sahi spelling fix ho jaati hai.
3. **Step 2** — aaj ke saare vendor DPR drag-drop kar do. Format kuch bhi ho — tool khud
   header row dhoondta hai aur columns map karta hai. Jahan galat lage, dropdown se theek kar do
   aur *Remember this mapping* dabao — agli baar khud ho jaayega.
4. **Step 3** — jo lines match nahi hui unko master se jodo. Ek baar jod diya, hamesha yaad rahega.
   Arithmetic check bhi yahin dikhega (jaise workdone > scope).
5. **Step 4** — final DPR ka preview dekho, bilkul aapke format mein.
6. **Step 5** — *Download the final DPR (.xlsx)*. Bas.

Kal phir wahi page kholo — master, mappings aur saare aliases pehle se yaad honge.

---

## How it reads a vendor file

This is the part that had to be right, so here is exactly what happens.

**The sheet is read as a grid with merged cells expanded.** Where an Area is merged
down ten rows, all ten rows can see it. Where a header merges `Plan` across `Month | Day`,
each sub-column inherits its group heading and becomes `Plan Month` / `Plan Day`.

**The header block is found by meaning, not position.** Every row is scored by how many of
its cells classify as real DPR columns; blocks of one, two or three rows are tried, and the
`a b c d` letter-code row that sits under a JSW header is recognised and skipped rather than
mistaken for the header.

**More than one table in a sheet is fine.** A "consolidated" sheet with `A. CIVIL WORKS (Cum)`
over one table and `B. STRUCTURAL ERECTION (MT)` over another is split into two blocks, each
routed to its own discipline, each with its own mapping.

**Columns are classified, not string-matched.** A DPR column is a pair — *what* and *when*:

| what | when | field |
|---|---|---|
| plan / target / programme | today / daily / FTD | Plan FTD |
| plan / target / programme | month / monthly / FTM | Plan FTM |
| achieved / actual / progress / done | today | Achieved FTD |
| achieved / actual / progress / done | this month, till previous | Achieved FTM till previous date |
| achieved / actual / progress / done | up to last month | Achieved till last month |

So `Plan for today`, `Daily Target`, `Today Plan` and `Plan FTD` are one column, and the tool
does not need to have seen the wording before. **Dates written into a heading are read against
your reporting date**: with a data date of 11-Sep-26, `Completed till 31.08.26` is last month,
`Completed in Sep till 10.09` is this month till previous day, and `Plan for Sep'26` is the
monthly plan. Abbreviations are expanded first (`mnth`, `drg`, `qty`, `avl`, `cum`, `gfc`,
`mtd`, `ftd`, `ftm`), and a trailing unit in brackets is treated as a unit — `BOQ Quantity (Cum)`
is scope in cubic metres, not a cumulative figure.

**The data itself is used to check the mapping.** Each column is profiled — how much of it is
numeric, how many distinct values, whether it is a 1,2,3… serial column. A quantity field will
not be mapped onto a serial number, and the structure name will not be mapped onto a column of
numbers. If no column claims the structure name, the most distinctive text column takes it
rather than the sheet being dropped.

**What it derives when the vendor's layout differs.** A vendor who reports *month to date
including today* still produces the right DPR: `Achieved FTM till previous date` is
back-calculated. Same for a vendor who reports only cumulative-till-date, or who gives
`% Complete` and `Balance` but no scope. Every such derivation is named on the Audit sheet.

**Rows that are not data are dropped**: the vendor's own `Sub Total` / `Grand Total` lines,
`Prepared by` / `Signature` footers, blank spacer rows, and the letter-code row. A row of text
with no numbers is read as the section heading it almost always is, and becomes the Area for
the rows beneath it. Numbers written as text (`1,188`) are read; `NIL`, `N.A.` and `-` are read
as nothing, not as zero.

**The contractor is read off the letterhead.** The first few rows are searched for a company
name — `MEHER FOUNDATION PVT LTD`, `ITD CEMENTATION INDIA LIMITED` — the legal suffix is
trimmed, and the result is snapped to the master's spelling. The file name is only a fallback.

## How it matches a line to your scope

Site engineers abbreviate and mistype, so the matcher expands the abbreviations a construction
site actually uses, normalises equipment codes, then compares token by token with an edit
distance:

| written by the vendor | in the master | score |
|---|---|---|
| `Fltration Main Bldg (P-1)` | `Filtration Main Building (Part-1)` | **98%** |
| `Conv. Gallery J1C1-J1C2` | `Conveyor gallery J1C1 & J1C2` | **100%** |
| `JH-02` | `JH02` | **100%** |
| `Elect. Sub-stn RMHS` | `Electrical Substation RMHS` | **100%** |
| `M/s Meher Foundations Pvt. Ltd.` | `Meher Foundation` | **95%** |
| `Fltration Main Bldg (P-1)` | `Filtration Main Building (Part-**2**)` | 51% |
| `BS - Filtration Main Building` | `TS - Filtration Main Building` | 68% |
| `Cooling Tower` | `Cooling Tower-**1**` | 51% |

Two guards keep it honest. **Numbers must agree** — Part-1 is not Part-2 and JH01 is not JH02,
however similar the words. **A short unmatched code blocks the match** — `BS` and `TS` differ by
two letters out of twenty-four, and they are different structures; 68% lands in the review list
rather than being matched silently.

Above 72% it matches on its own, 48–72% it asks you, below that it is a new line. Your answer
is stored as an alias, so tomorrow it matches by itself.

**The same item reported twice becomes one line** — fuzzily, so one vendor's `JH-02` and
another's `JH02` merge — but only ever inside one discipline, activity and agency, so Supply
never absorbs Erection.

**One spelling per name.** `Material handling facilities`, `Material Handling Facilities` and
`MHS` become one area. The master spelling always wins.

**The arithmetic is checked**: workdone above scope, front above scope, negative quantities,
progress against a missing scope. The numbers still go in exactly as the vendor sent them —
this is a flag, not a correction.

## What comes out

| Sheet | Contents |
|---|---|
| **Summary-AreaWise** | The printed summary, grouped Area → Activity → Agency, with sub totals and a grand total. `% Complete`, `Balance` and every total are **live Excel formulas**, not pasted numbers. |
| **Piling, Civil, Structural, …** | One backup sheet per discipline, in your existing column layout. Variance, Achieved FTM, Workdone, % Complete and Balance are formulas. |
| **Audit** | Every row the tool was unsure about, every failed arithmetic check, and — for each source — which file, which sheet, which header row and which column mapping produced the numbers. This is the sheet for the reviewer who asks *"where did this come from?"* |
| **Config** | Dates, preparer, source file list, and the formulas used. |

Colour code, same as the template: **yellow** = imported or typed, **green** = key column used
for matching, **blue** = calculated.

---

## The arithmetic (unchanged from your current DPR)

```
Variance for the Day     n = Plan FTD − Achieved FTD
Achieved FTM till date   p = Achieved FTD + Achieved FTM till previous date
Workdone Till Date       q = Achieved till last month + Achieved FTM till date
% Complete               r = Workdone Till Date ÷ Scope
Balance                  s = Scope − Workdone Till Date
```

---

## One deliberate change to your format

Your current workbook carries the **area as a bold heading row** inside each backup sheet, so the
summary has to hard-code row numbers — `SUMIFS(Structural!H89:H106, …)`. Insert a row anywhere
above 89 and the summary silently reports the wrong number, with no error to warn you.

The template makes **Area** and **Activity** real columns. The formulas then address whole column
ranges and never need maintenance again:

```
=SUMIFS(INDIRECT("'"&$Q8&"'!$G$9:$G$408"),
        INDIRECT("'"&$Q8&"'!$D$9:$D$408"), $P8,    ← Area
        INDIRECT("'"&$Q8&"'!$E$9:$E$408"), $C8,    ← Activity
        INDIRECT("'"&$Q8&"'!$F$9:$F$408"), $D8)    ← Agency
```

`P` (Area) and `Q` (Source sheet) are helper columns, greyed and outside the print area, so the
printed sheet still looks exactly like today's.

Everything else — column order, letter codes under each header, the JSW title block, the
sub-total rows — is as it was.

---

## Doing it in Excel instead

The workbook can import a vendor file on its own, without the browser:

1. **`1-Paste vendor data`** — open the vendor's file, copy their whole table including the
   header row, and paste it at cell **B5**. Any column order, any wording, extra columns fine.
2. **`2-Map and convert`** — row 5 is a drop-down of the headings you just pasted, with a
   suggestion already filled in wherever the wording was recognisable. Correct anything wrong;
   a heading picked twice is flagged `used twice` above it. Row 6 supplies anything the vendor
   left out entirely — their Area, or their own name — applied to every row.
3. Row 10 downwards is now the vendor's data in the approved column order, with Variance,
   Achieved FTM, Workdone, % Complete and Balance already computed. Copy that block into the
   matching discipline sheet.

Numbers that arrived as text (`1,188`) are converted on the way through. The Excel path uses a
plain keyword suggestion rather than the browser's full classifier, so expect to correct one or
two drop-downs — it is the manual route, and the drop-downs are the point.

## Teaching it a new vendor

Nothing to code. Three places to teach it, in order of effort:

1. **A one-off wrong column** — fix the dropdown on step 2. Takes a second.
2. **A vendor whose layout never changes** — fix it once, press *Remember this mapping*. Matched
   by file name from then on, so `Vensar DPR 12-09.xlsx` reuses what you taught
   `Vensar DPR 11-09.xlsx`.
3. **A wording your whole organisation uses** — add it to the `Mapping` sheet of the template
   *and* to the `SYN` table near the top of `dpr_consolidator.html`. The two lists are kept
   deliberately identical.

Moving to another laptop: **Save session** writes a small `.json` with the master, the aliases and
every mapping. **Open session** on the other machine restores it.

---

## Files

```
dpr/
├── DPR_Consolidator_offline.html   the tool — self-contained, ship this one
├── dpr_consolidator.html           same tool, CDN version (the source you edit)
├── JSW_DPR_Template.xlsx           the approved-format workbook
├── schema.py                       column layout — single source of truth
├── build_template.py               generates the .xlsx
├── build_offline.py                inlines SheetJS + JSZip into the offline .html
├── make_samples.py                 three mismatched vendor DPRs
├── make_hard_samples.py            five deliberately nasty ones
├── samples/  samples-hard/         …the files they produce
├── test_e2e.mjs                    browser test: load → map → match → export → reload
├── test_hard.mjs                   33 assertions against the nasty files
├── bench.mjs                       prints what the reader got out of each file
├── probe_matcher.mjs               prints the matcher's score for known name pairs
├── validate_xlsx.py                OOXML structural validation
├── verify_export.py                proves the exported formulas reference the right cells
├── verify_formulas.py              same proof for the template
└── vendor/                         SheetJS + JSZip, for the offline build
```

Rebuild and test:

```bash
cd dpr
npm install          # playwright, for the browser test only
npm run build        # regenerate the .xlsx and the offline .html
npm test             # end-to-end + both workbook validators
```

`test_e2e.mjs` loads three vendor files in three different layouts, consolidates them, exports
the DPR, then **loads that DPR back in as the master scope** and confirms all 26 lines re-match
automatically.

`test_hard.mjs` runs 33 assertions against five files built to break a parser:

| file | what it throws at the reader |
|---|---|
| Meher | area merged down its rows, merged two-row group header, letter-code row, `1,188` as text, `NIL` / `N.A.` / `-`, per-area sub totals, signature footer |
| Vensar | two independent tables stacked in one sheet, each with its own header and its own discipline |
| Goel | twelve rows of preamble, UOM and % columns, notes and signature block after the data |
| ITD | csv with a BOM, blank spacer rows mid-table, dates written into the column headings |
| site engineer | abbreviated headings, misspelt structure names, no letterhead at all |

`npm run match` prints the matcher's score for a list of known name pairs — useful when tuning
the abbreviation table.

---

## Limits worth knowing

- The tool reads `.xlsx`, `.xlsm`, `.xls` and `.csv`. Password-protected files must be unlocked
  first; PDF DPRs are not readable and have to be keyed in.
- It reads **values**, not formulas, from vendor files — which is what you want, but a vendor
  file whose cached values are stale will hand over stale numbers.
- Everything it remembers lives in that browser's local storage. Clearing site data loses it,
  so keep a saved session file.
- Matching is a suggestion, not proof. The Audit sheet exists because the last call is yours.

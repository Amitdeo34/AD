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

## What the tool actually does

**Finds the header row.** It scores the first 25 rows against a dictionary of DPR column
wordings and picks the best one. Two-row headers (`Plan` over `Month` / `Day`) get merged into
`Plan Month` and `Plan Day` before matching.

**Maps the columns.** Every vendor heading is scored against a synonym list — `Achieved FTD`,
`Actual Day`, `Progress Today`, `Done for the day` all land on the same field. Each mapping shows
its confidence, and anything below 85% is flagged for you to look at. For the columns a DPR
cannot do without, a second lower-threshold pass runs rather than silently dropping a number.

**Reads the vendor's section headings.** In most DPRs the area is a bold heading row, not a
column. A row with text and no numbers is treated as the area for everything beneath it.

**Drops the vendor's own totals** so they are never double-counted.

**Matches each line to your master scope** on structure name (55%), agency (20%), activity (15%)
and area (10%). Above 72% it matches silently; 48–72% it asks you; below that it is a new line.
Your answer is stored as an alias, so tomorrow it matches by itself.

**Uses one spelling per name.** `Material handling facilities` and `Material Handling Facilities`
become one area, not two. The master spelling always wins.

**Merges duplicates.** The same item in two files becomes one line, highest value kept, and the
Audit sheet says so.

**Checks the arithmetic.** Workdone above scope, front above scope, negative quantities, progress
against a missing scope. The numbers still go in exactly as the vendor sent them — this is a
flag, not a correction.

---

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
├── make_samples.py                 three deliberately mismatched vendor DPRs
├── samples/                        …the files they produce
├── test_e2e.mjs                    browser test: load → map → match → export → reload
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

The test loads three vendor files in three different layouts (bold area heading rows, a plain
CSV, a two-row merged header split across Supply and Erection sheets), consolidates them,
exports the DPR, then **loads that DPR back in as the master scope** and confirms all 26 lines
re-match automatically.

---

## Limits worth knowing

- The tool reads `.xlsx`, `.xlsm`, `.xls` and `.csv`. Password-protected files must be unlocked
  first; PDF DPRs are not readable and have to be keyed in.
- It reads **values**, not formulas, from vendor files — which is what you want, but a vendor
  file whose cached values are stale will hand over stale numbers.
- Everything it remembers lives in that browser's local storage. Clearing site data loses it,
  so keep a saved session file.
- Matching is a suggestion, not proof. The Audit sheet exists because the last call is yours.

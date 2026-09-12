# -*- coding: utf-8 -*-
"""Generate JSW_DPR_Template.xlsx - the approved-format DPR workbook.

    python3 build_template.py [output.xlsx]
"""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
from openpyxl.utils import get_column_letter as CL
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule

from schema import (BACKUP_COLUMNS, BACKUP_CODES, COL_INDEX, HDR_ROW, CODE_ROW,
                    DATA_ROW, MAX_ROWS, SUMMARY_COLUMNS, SUMMARY_CODES,
                    DISCIPLINES, EXTRA_ACTIVITIES, MANPOWER_COLUMNS, DEFAULT_AREAS)

# ------------------------------------------------------------------ palette
NAVY      = "1F3864"
HDR_BLUE  = "2E5395"
CODE_BLUE = "4472C4"
GREY      = "F2F2F2"
INPUT_BG  = "FFF7E0"   # yellow  = type here
CALC_BG   = "E8EDF7"   # blue    = calculated, do not type
KEY_BG    = "E2EFDA"   # green   = key / matching columns
HELP_BG   = "F5F5F5"

thin = Side(style="thin", color="B4C6E7")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)


def style_header(ws, row, cols, start_col=2, fill=HDR_BLUE, height=34):
    ws.row_dimensions[row].height = height
    for i, (_k, _ltr, head, width, _kind) in enumerate(cols):
        c = ws.cell(row=row, column=start_col + i, value=head)
        c.fill = PatternFill("solid", fgColor=fill)
        c.font = Font(name="Arial", size=9, bold=True, color="FFFFFF")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER
        ws.column_dimensions[CL(start_col + i)].width = width


def style_codes(ws, row, cols, codes, start_col=2):
    ws.row_dimensions[row].height = 15
    for i, (k, ltr, *_r) in enumerate(cols):
        c = ws.cell(row=row, column=start_col + i, value=codes.get(k, ltr))
        c.fill = PatternFill("solid", fgColor=CODE_BLUE)
        c.font = Font(name="Arial", size=8, italic=True, color="FFFFFF")
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER


def title_block(ws, title, last_col_letter):
    ws.column_dimensions["A"].width = 2.5
    for r in range(1, HDR_ROW):
        ws.row_dimensions[r].height = 15
    ws.merge_cells(f"C3:{last_col_letter}3")
    t = ws["C3"]
    t.value = title
    t.font = Font(name="Arial", size=14, bold=True, color=NAVY)
    t.alignment = Alignment(horizontal="center", vertical="center")

    ws.merge_cells(f"C4:{last_col_letter}4")
    s = ws["C4"]
    s.value = "=Config!$C$4"
    s.font = Font(name="Arial", size=11, bold=True, color=NAVY)
    s.alignment = Alignment(horizontal="center", vertical="center")

    ws["B2"] = "JSW"
    ws["B2"].font = Font(name="Arial", size=16, bold=True, color="C00000")

    # data / reporting date block on the right
    ws[f"{CL(ws.max_column)}1"] = None
    lab_col = max(3, ws.max_column - 3)
    ws.cell(row=5, column=lab_col, value="Data date:").font = Font(name="Arial", size=9, bold=True)
    ws.cell(row=5, column=lab_col + 1, value="=Config!$C$6").font = Font(name="Arial", size=9, bold=True)
    ws.cell(row=6, column=lab_col, value="Reporting date:").font = Font(name="Arial", size=9, bold=True)
    ws.cell(row=6, column=lab_col + 1, value="=Config!$C$7").font = Font(name="Arial", size=9, bold=True)
    for r in (5, 6):
        ws.cell(row=r, column=lab_col).alignment = Alignment(horizontal="right")
        ws.cell(row=r, column=lab_col + 1).number_format = "dd-mmm-yy"


# ------------------------------------------------------------------ Config
def build_config(wb):
    ws = wb.create_sheet("Config")
    ws.sheet_properties.tabColor = "808080"
    ws.column_dimensions["B"].width = 26
    ws.column_dimensions["C"].width = 46
    ws["B2"] = "DPR CONFIGURATION"
    ws["B2"].font = Font(name="Arial", size=13, bold=True, color=NAVY)
    rows = [
        ("Project title",        "Phase-1 Greenfield Expansion Projects, JSW Utkal Steel Limited"),
        ("Report name",          "Daily Progress Report"),
        ("Data date",            "=TODAY()-1"),
        ("Reporting date",       "=TODAY()"),
        ("Reporting month label", '=TEXT(Config!$C$6,"mmm-yy")'),
        ("Prepared by",          ""),
        ("Reviewed by",          ""),
    ]
    for i, (lab, val) in enumerate(rows):
        r = 4 + i
        ws.cell(row=r, column=2, value=lab).font = Font(name="Arial", size=10, bold=True)
        c = ws.cell(row=r, column=3, value=val or None)
        c.fill = PatternFill("solid", fgColor=INPUT_BG)
        c.border = BORDER
        c.font = Font(name="Arial", size=10)
        if "date" in lab.lower():
            c.number_format = "dd-mmm-yy"

    ws["B13"] = "MASTER LISTS  (used by the drop-downs on every sheet)"
    ws["B13"].font = Font(name="Arial", size=11, bold=True, color=NAVY)
    ws["B14"] = "Areas"
    ws["C14"] = "Activities"
    ws["D14"] = "Agencies / Contractors"
    for col in ("B", "C", "D"):
        ws[f"{col}14"].font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        ws[f"{col}14"].fill = PatternFill("solid", fgColor=HDR_BLUE)
    ws.column_dimensions["D"].width = 30

    for i, a in enumerate(DEFAULT_AREAS):
        ws.cell(row=15 + i, column=2, value=a).fill = PatternFill("solid", fgColor=INPUT_BG)

    acts = []
    for sheet, default_act, _uom in DISCIPLINES:
        acts.extend(EXTRA_ACTIVITIES.get(sheet, [default_act]))
    for i, a in enumerate(acts):
        ws.cell(row=15 + i, column=3, value=a).fill = PatternFill("solid", fgColor=INPUT_BG)

    agencies = ["ITD Cementation", "Meher Foundation", "Vensar Constructions",
                "Sreehita Constructions", "Surya Enterprises", "Goel Constructions",
                "SPD", "Vaishnavi", "Shobha", "Ganesh", "NKS",
                "Sri Balaji Constructions", "ARDEE", "VSI", "Jagdamba", "Rohan"]
    for i, a in enumerate(agencies):
        ws.cell(row=15 + i, column=4, value=a).fill = PatternFill("solid", fgColor=INPUT_BG)

    wb.defined_names.add(_dn("Areas",      "Config", f"$B$15:$B${15 + 199}"))
    wb.defined_names.add(_dn("Activities", "Config", f"$C$15:$C${15 + 199}"))
    wb.defined_names.add(_dn("Agencies",   "Config", f"$D$15:$D${15 + 199}"))
    return ws


def _dn(name, sheet, ref):
    from openpyxl.workbook.defined_name import DefinedName
    return DefinedName(name, attr_text=f"'{sheet}'!{ref}")


# ------------------------------------------------------------------ backup sheet
def build_backup(wb, sheet_name, default_activity, uom):
    ws = wb.create_sheet(sheet_name)
    ws.sheet_properties.tabColor = "4472C4"
    last = CL(1 + len(BACKUP_COLUMNS))
    title_block(ws, f"{default_activity.split('(')[0].strip()}  —  Backup Sheet   (UOM: {uom})", last)
    style_header(ws, HDR_ROW, BACKUP_COLUMNS)
    style_codes(ws, CODE_ROW, BACKUP_COLUMNS, BACKUP_CODES)

    C = COL_INDEX
    L = {k: CL(v) for k, v in C.items()}

    for r in range(DATA_ROW, DATA_ROW + MAX_ROWS):
        guard = f'$C{r}=""'
        ws.cell(row=r, column=C["sl"],       value=f'=IF($C{r}="","",COUNTA($C${DATA_ROW}:$C{r}))')
        ws.cell(row=r, column=C["variance"], value=f'=IF({guard},"",N({L["plan_ftd"]}{r})-N({L["ach_ftd"]}{r}))')
        ws.cell(row=r, column=C["ach_ftm"],  value=f'=IF({guard},"",N({L["ach_ftd"]}{r})+N({L["ach_ftm_prev"]}{r}))')
        ws.cell(row=r, column=C["workdone"], value=f'=IF({guard},"",N({L["last_month"]}{r})+N({L["ach_ftm"]}{r}))')
        ws.cell(row=r, column=C["pct"],      value=f'=IF(OR({guard},N(${L["scope"]}{r})=0),"",{L["workdone"]}{r}/${L["scope"]}{r})')
        ws.cell(row=r, column=C["balance"],  value=f'=IF({guard},"",N(${L["scope"]}{r})-N({L["workdone"]}{r}))')

        for k, ltr, head, width, kind in BACKUP_COLUMNS:
            c = ws.cell(row=r, column=C[k])
            c.border = BORDER
            c.font = Font(name="Arial", size=9)
            if kind == "formula" or k == "sl":
                c.fill = PatternFill("solid", fgColor=CALC_BG)
            elif k in ("area", "activity", "agency", "structure"):
                c.fill = PatternFill("solid", fgColor=KEY_BG)
            else:
                c.fill = PatternFill("solid", fgColor=INPUT_BG)
            if kind in ("num", "formula"):
                c.number_format = "#,##0.00;[Red]-#,##0.00;\"-\""
                c.alignment = Alignment(horizontal="right")
            if k == "sl":
                c.number_format = "0"
                c.alignment = Alignment(horizontal="center")
            if k == "pct":
                c.number_format = "0%"
            if k in ("structure", "reason", "remarks"):
                c.alignment = Alignment(horizontal="left", wrap_text=False)

    rng = f'{L["area"]}{DATA_ROW}:{L["area"]}{DATA_ROW+MAX_ROWS-1}'
    _add_dv(ws, "=Areas", rng)
    _add_dv(ws, "=Activities", f'{L["activity"]}{DATA_ROW}:{L["activity"]}{DATA_ROW+MAX_ROWS-1}')
    _add_dv(ws, "=Agencies", f'{L["agency"]}{DATA_ROW}:{L["agency"]}{DATA_ROW+MAX_ROWS-1}')

    # helpful default for the Activity column
    ws.cell(row=DATA_ROW - 1, column=C["activity"]).comment = None

    ws.freeze_panes = ws.cell(row=DATA_ROW, column=C["scope"])
    ws.auto_filter.ref = f"B{HDR_ROW}:{last}{DATA_ROW+MAX_ROWS-1}"
    ws.sheet_view.zoomScale = 85
    ws.print_title_rows = f"{HDR_ROW}:{CODE_ROW}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    # highlight negative variance (behind plan) in red
    ws.conditional_formatting.add(
        f'{L["variance"]}{DATA_ROW}:{L["variance"]}{DATA_ROW+MAX_ROWS-1}',
        CellIsRule(operator="greaterThan", formula=["0"],
                   font=Font(color="9C0006", bold=True),
                   fill=PatternFill("solid", bgColor="FFC7CE")))
    ws.conditional_formatting.add(
        f'{L["pct"]}{DATA_ROW}:{L["pct"]}{DATA_ROW+MAX_ROWS-1}',
        ColorScaleRule(start_type="num", start_value=0, start_color="F8696B",
                       mid_type="num",   mid_value=0.5, mid_color="FFEB84",
                       end_type="num",   end_value=1,   end_color="63BE7B"))
    return ws


def _add_dv(ws, formula, cell_range):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add(cell_range)


# ------------------------------------------------------------------ manpower
def build_manpower(wb):
    ws = wb.create_sheet("Manpower")
    ws.sheet_properties.tabColor = "7030A0"
    last = CL(1 + len(MANPOWER_COLUMNS))
    title_block(ws, "Manpower Deployment  —  Backup Sheet", last)
    style_header(ws, HDR_ROW, MANPOWER_COLUMNS)
    style_codes(ws, CODE_ROW, MANPOWER_COLUMNS, {"variance": "g = f-e"})
    idx = {k: i + 2 for i, (k, *_r) in enumerate(MANPOWER_COLUMNS)}
    for r in range(DATA_ROW, DATA_ROW + 300):
        ws.cell(row=r, column=idx["sl"], value=f'=IF($C{r}="","",COUNTA($C${DATA_ROW}:$C{r}))')
        ws.cell(row=r, column=idx["variance"], value=f'=IF($C{r}="","",N(F{r})-N(E{r}))')
        for k, ltr, head, width, kind in MANPOWER_COLUMNS:
            c = ws.cell(row=r, column=idx[k])
            c.border = BORDER
            c.font = Font(name="Arial", size=9)
            c.fill = PatternFill("solid", fgColor=CALC_BG if kind == "formula" or k == "sl" else INPUT_BG)
            if kind in ("num", "formula"):
                c.number_format = '#,##0;[Red]-#,##0;"-"'
    _add_dv(ws, "=Areas",    f"C{DATA_ROW}:C{DATA_ROW+299}")
    _add_dv(ws, "=Agencies", f"D{DATA_ROW}:D{DATA_ROW+299}")
    ws.freeze_panes = f"B{DATA_ROW}"
    ws.auto_filter.ref = f"B{HDR_ROW}:{last}{DATA_ROW+299}"
    return ws


# ------------------------------------------------------------------ summary
SUM_HDR, SUM_CODE, SUM_DATA, SUM_ROWS = 6, 7, 8, 150


def build_summary(wb):
    ws = wb.create_sheet("Summary-AreaWise", 0)
    ws.sheet_properties.tabColor = "C00000"
    cols = [(k, l, h.replace("{MON}", "the Month"), w, kd) for k, l, h, w, kd in SUMMARY_COLUMNS]
    last = CL(1 + len(cols))
    ws.column_dimensions["A"].width = 2.5
    ws.merge_cells(f"C2:{last}2")
    ws["C2"] = "=Config!$C$5"
    ws["C2"].font = Font(name="Arial", size=15, bold=True, color=NAVY)
    ws["C2"].alignment = Alignment(horizontal="center")
    ws.merge_cells(f"C3:{last}3")
    ws["C3"] = "=Config!$C$4"
    ws["C3"].font = Font(name="Arial", size=11, bold=True, color=NAVY)
    ws["C3"].alignment = Alignment(horizontal="center")
    ws["B2"] = "JSW"
    ws["B2"].font = Font(name="Arial", size=16, bold=True, color="C00000")
    ws["J4"] = "Data date:"
    ws["K4"] = "=Config!$C$6"
    ws["J5"] = "Reporting date:"
    ws["K5"] = "=Config!$C$7"
    for r in (4, 5):
        ws.cell(row=r, column=10).font = Font(name="Arial", size=9, bold=True)
        ws.cell(row=r, column=10).alignment = Alignment(horizontal="right")
        ws.cell(row=r, column=11).font = Font(name="Arial", size=9, bold=True)
        ws.cell(row=r, column=11).number_format = "dd-mmm-yy"

    style_header(ws, SUM_HDR, cols, fill=NAVY, height=40)
    style_codes(ws, SUM_CODE, cols, SUMMARY_CODES)
    # month-driven captions
    ws.cell(row=SUM_HDR, column=11, value='=\"Plan for \"&Config!$C$8')
    ws.cell(row=SUM_HDR, column=12, value='=\"Achieved for \"&Config!$C$8')

    idx = {k: i + 2 for i, (k, *_r) in enumerate(SUMMARY_COLUMNS)}
    Lt = {k: CL(v) for k, v in idx.items()}

    # helper columns (not printed)
    for col, head in ((16, "Area  (helper)"), (17, "Source sheet  (helper)")):
        c = ws.cell(row=SUM_HDR, column=col, value=head)
        c.fill = PatternFill("solid", fgColor="808080")
        c.font = Font(name="Arial", size=9, bold=True, color="FFFFFF")
        c.alignment = Alignment(horizontal="center", wrap_text=True)
        ws.column_dimensions[CL(col)].width = 24

    sheets = [d[0] for d in DISCIPLINES]
    for r in range(SUM_DATA, SUM_DATA + SUM_ROWS):
        sc, ac, ag, sh = f"$P{r}", f"$C{r}", f"$D{r}", f"$Q{r}"
        blank = f'OR($C{r}="",$Q{r}="")'
        def sumifs(src_letter):
            return (f'=IF({blank},"",IFERROR(SUMIFS('
                    f'INDIRECT("\'"&{sh}&"\'!${src_letter}$9:${src_letter}$408"),'
                    f'INDIRECT("\'"&{sh}&"\'!$D$9:$D$408"),{sc},'
                    f'INDIRECT("\'"&{sh}&"\'!$E$9:$E$408"),{ac},'
                    f'INDIRECT("\'"&{sh}&"\'!$F$9:$F$408"),{ag}),""))')
        src = {"scope": "G", "drawing": "H", "front": "I", "workdone": "R",
               "plan_ftm": "K", "ach_ftm": "Q", "ach_ftd": "M", "manpower": "V"}
        for k, letter in src.items():
            ws.cell(row=r, column=idx[k], value=sumifs(letter))
        ws.cell(row=r, column=idx["pct"],
                value=f'=IF(OR({blank},N({Lt["scope"]}{r})=0),"",{Lt["workdone"]}{r}/{Lt["scope"]}{r})')
        ws.cell(row=r, column=idx["balance"],
                value=f'=IF({blank},"",N({Lt["scope"]}{r})-N({Lt["workdone"]}{r}))')
        ws.cell(row=r, column=idx["sl"],
                value=f'=IF({blank},"",COUNTA($C${SUM_DATA}:$C{r}))')

        for k, ltr, head, width, kind in SUMMARY_COLUMNS:
            c = ws.cell(row=r, column=idx[k])
            c.border = BORDER
            c.font = Font(name="Arial", size=9)
            c.fill = PatternFill("solid", fgColor=KEY_BG if k in ("activity", "agency") else CALC_BG)
            if kind == "num":
                c.number_format = '#,##0;[Red]-#,##0;"-"'
                c.alignment = Alignment(horizontal="right")
            if k == "pct":
                c.number_format = "0%"
                c.alignment = Alignment(horizontal="center")
            if k == "sl":
                c.number_format = "0"
                c.alignment = Alignment(horizontal="center")
        for col in (16, 17):
            c = ws.cell(row=r, column=col)
            c.fill = PatternFill("solid", fgColor=HELP_BG)
            c.border = BORDER
            c.font = Font(name="Arial", size=9, color="595959")

    _add_dv(ws, "=Areas",      f"P{SUM_DATA}:P{SUM_DATA+SUM_ROWS-1}")
    _add_dv(ws, "=Activities", f"C{SUM_DATA}:C{SUM_DATA+SUM_ROWS-1}")
    _add_dv(ws, "=Agencies",   f"D{SUM_DATA}:D{SUM_DATA+SUM_ROWS-1}")
    dv = DataValidation(type="list", formula1='"' + ",".join(sheets) + '"',
                        allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add(f"Q{SUM_DATA}:Q{SUM_DATA+SUM_ROWS-1}")

    ws.freeze_panes = f"E{SUM_DATA}"
    ws.print_area = f"B1:{last}{SUM_DATA+SUM_ROWS-1}"
    ws.print_title_rows = f"{SUM_HDR}:{SUM_CODE}"
    ws.page_setup.orientation = "landscape"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.sheet_view.zoomScale = 85
    ws.conditional_formatting.add(
        f'{Lt["pct"]}{SUM_DATA}:{Lt["pct"]}{SUM_DATA+SUM_ROWS-1}',
        ColorScaleRule(start_type="num", start_value=0, start_color="F8696B",
                       mid_type="num", mid_value=0.5, mid_color="FFEB84",
                       end_type="num", end_value=1, end_color="63BE7B"))
    return ws


# ------------------------------------------------------------------ import / mapping
CANON_FIELDS = [k for k, *_r in BACKUP_COLUMNS if k not in ("sl", "variance", "ach_ftm", "workdone", "pct", "balance")]


PASTE_FIRST_COL = 2          # column B on "1-Paste vendor data"
PASTE_LAST_COL  = 61         # column BI  -> 60 vendor columns
PASTE_HDR_ROW   = 5
PASTE_ROWS      = 1000


def build_paste(wb):
    """A free area the user pastes any vendor DPR into, headers on row 5."""
    ws = wb.create_sheet("1-Paste vendor data")
    ws.sheet_properties.tabColor = "ED7D31"
    ws.column_dimensions["A"].width = 2.5
    ws["B2"] = "STEP 1  —  PASTE THE VENDOR'S SHEET HERE"
    ws["B2"].font = Font(name="Arial", size=14, bold=True, color=NAVY)
    ws["B3"] = ("Open the vendor's file, select their whole table INCLUDING the header row, copy, "
                "then click cell B5 below and Paste Special > Values.  Any column order is fine, "
                "any wording is fine, extra columns are fine.  Then go to the sheet "
                "'2-Map and convert'.")
    ws["B3"].font = Font(name="Arial", size=10, italic=True, color="595959")
    ws.merge_cells("B3:N3")
    ws["B4"] = "\u25bc  header row goes in row 5, first data row in row 6"
    ws["B4"].font = Font(name="Arial", size=9, bold=True, color="C00000")

    for c in range(PASTE_FIRST_COL, PASTE_LAST_COL + 1):
        cell = ws.cell(row=PASTE_HDR_ROW, column=c)
        cell.fill = PatternFill("solid", fgColor=HDR_BLUE)
        cell.font = Font(name="Arial", size=9, bold=True, color="FFFFFF")
        cell.border = BORDER
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws.column_dimensions[CL(c)].width = 15
    ws.row_dimensions[PASTE_HDR_ROW].height = 30
    for r in range(PASTE_HDR_ROW + 1, PASTE_HDR_ROW + 1 + PASTE_ROWS):
        for c in range(PASTE_FIRST_COL, PASTE_LAST_COL + 1):
            cell = ws.cell(row=r, column=c)
            cell.fill = PatternFill("solid", fgColor=INPUT_BG)
            cell.font = Font(name="Arial", size=9)
    ws.freeze_panes = "B6"
    return ws


# vendor wordings the Excel side auto-suggests, most specific first
SUGGEST = {
    "structure":    ["name of the structure", "name of structure", "description of work",
                     "description", "structure", "particular", "item"],
    "area":         ["area", "zone", "location", "block"],
    "activity":     ["activity", "discipline", "sub head"],
    "agency":       ["agency", "contractor", "vendor", "party"],
    "scope":        ["total scope", "scope", "boq", "contract qty", "total qty", "quantity"],
    "drawing":      ["drawing released", "drawing issued", "drawing", "gfc", "ifc"],
    "front":        ["front available", "front"],
    "last_month":   ["till last month", "upto last month", "up to last month", "last month",
                     "cum. upto", "opening"],
    "plan_ftm":     ["plan ftm", "plan for the month", "monthly target", "target this month",
                     "monthly plan", "plan month"],
    "plan_ftd":     ["plan ftd", "plan for the day", "daily target", "target today",
                     "daily plan", "today plan", "plan day"],
    "ach_ftd":      ["achieved ftd", "achieved for the day", "progress for the day",
                     "progress today", "achieved today", "actual day", "done today"],
    "ach_ftm_prev": ["till previous", "previous day", "till yesterday", "month till prev",
                     "mtd previous", "ftm till previous"],
    "reason":       ["reason", "constraint", "slippage"],
    "remarks":      ["remark", "comment", "status"],
    "manpower":     ["manpower", "labour", "labor", "workmen"],
}

MAP_VCOL_ROW  = 5     # dropdown: which vendor column
MAP_FIXED_ROW = 6     # or a fixed value for every row
MAP_IDX_ROW   = 7     # helper: resolved column number
MAP_HDR_ROW   = 8
MAP_CODE_ROW  = 9
MAP_DATA_ROW  = 10
MAP_ROWS      = 500


def build_map(wb):
    """Pulls the pasted block into the approved column order and computes the rest."""
    ws = wb.create_sheet("2-Map and convert")
    ws.sheet_properties.tabColor = "FFC000"
    last = CL(1 + len(BACKUP_COLUMNS))
    ws.column_dimensions["A"].width = 2.5
    ws["B2"] = "STEP 2  —  TELL IT WHICH VENDOR COLUMN IS WHICH"
    ws["B2"].font = Font(name="Arial", size=14, bold=True, color=NAVY)
    ws.merge_cells("B3:" + last + "3")
    ws["B3"] = ("Row 5 is a drop-down of the headings you pasted - pick the matching one. "
                "A suggestion is already filled in wherever the wording was recognisable; change "
                "any that look wrong.  Row 6 is for a value the vendor did not send at all "
                "(their Area, or their own name) - it is applied to every row.  "
                "When row 10 downwards looks right, copy it into the discipline sheet.")
    ws["B3"].font = Font(name="Arial", size=10, italic=True, color="595959")
    ws.row_dimensions[3].height = 30
    ws["B3"].alignment = Alignment(wrap_text=True, vertical="top")

    hdr_rng = "'1-Paste vendor data'!$%s$%d:$%s$%d" % (
        CL(PASTE_FIRST_COL), PASTE_HDR_ROW, CL(PASTE_LAST_COL), PASTE_HDR_ROW)
    data_rng = "'1-Paste vendor data'!$%s$%d:$%s$%d" % (
        CL(PASTE_FIRST_COL), PASTE_HDR_ROW + 1, CL(PASTE_LAST_COL), PASTE_HDR_ROW + PASTE_ROWS)

    C = COL_INDEX
    lab = {k: CL(v) for k, v in C.items()}
    calc_keys = {"sl", "variance", "ach_ftm", "workdone", "pct", "balance"}

    for k, letter, head, width, kind in BACKUP_COLUMNS:
        col = C[k]
        L = lab[k]
        ws.column_dimensions[L].width = width

        if k in calc_keys:
            c = ws.cell(row=MAP_VCOL_ROW, column=col, value="calculated")
            c.font = Font(name="Arial", size=8, italic=True, color="595959")
            c.alignment = Alignment(horizontal="center")
            c.fill = PatternFill("solid", fgColor=CALC_BG)
            for r in (MAP_FIXED_ROW, MAP_IDX_ROW):
                ws.cell(row=r, column=col).fill = PatternFill("solid", fgColor=CALC_BG)
        else:
            # suggestion: first pasted heading that contains one of the known wordings
            expr = '""'
            for kw in reversed(SUGGEST.get(k, [])):
                expr = 'IFERROR(INDEX(%s,MATCH("*%s*",%s,0)),%s)' % (hdr_rng, kw, hdr_rng, expr)
            c = ws.cell(row=MAP_VCOL_ROW, column=col, value="=" + expr)
            c.fill = PatternFill("solid", fgColor=KEY_BG)
            c.font = Font(name="Arial", size=9, bold=True)
            c.border = BORDER
            c.alignment = Alignment(horizontal="center", wrap_text=True)

            f = ws.cell(row=MAP_FIXED_ROW, column=col)
            f.fill = PatternFill("solid", fgColor=INPUT_BG)
            f.font = Font(name="Arial", size=9, italic=True)
            f.border = BORDER
            f.alignment = Alignment(horizontal="center")

            i = ws.cell(row=MAP_IDX_ROW, column=col,
                        value='=IFERROR(MATCH(%s$%d,%s,0),0)' % (L, MAP_VCOL_ROW, hdr_rng))
            i.fill = PatternFill("solid", fgColor=HELP_BG)
            i.font = Font(name="Arial", size=8, color="A6A6A6")
            i.alignment = Alignment(horizontal="center")

    # two fields pointing at the same pasted column is the one mistake this
    # layout invites, so say so loudly
    first_L = CL(C["structure"]); last_L = CL(C["manpower"])
    for k, *_r in BACKUP_COLUMNS:
        if k in calc_keys:
            continue
        L = lab[k]
        w = ws.cell(row=4, column=C[k],
                    value='=IF(AND(%s$%d<>"",COUNTIF($%s$%d:$%s$%d,%s$%d)>1),"used twice","")'
                          % (L, MAP_VCOL_ROW, first_L, MAP_VCOL_ROW, last_L, MAP_VCOL_ROW,
                             L, MAP_VCOL_ROW))
        w.font = Font(name="Arial", size=8, bold=True, color="C00000")
        w.alignment = Alignment(horizontal="center")

    ws.cell(row=MAP_VCOL_ROW, column=1, value=None)
    for r, txt in ((MAP_VCOL_ROW, "vendor column \u25b6"),
                   (MAP_FIXED_ROW, "or fixed value \u25b6"),
                   (MAP_IDX_ROW, "col no.")):
        ws.cell(row=r, column=1).value = None
    ws.row_dimensions[MAP_VCOL_ROW].height = 26

    style_header(ws, MAP_HDR_ROW, BACKUP_COLUMNS)
    style_codes(ws, MAP_CODE_ROW, BACKUP_COLUMNS, BACKUP_CODES)

    struct_L = lab["structure"]
    for r in range(MAP_DATA_ROW, MAP_DATA_ROW + MAP_ROWS):
        rel = r - MAP_CODE_ROW                      # 1 for the first data row
        gate = '$%s%d=""' % (struct_L, r)
        for k, letter, head, width, kind in BACKUP_COLUMNS:
            col, L = C[k], lab[k]
            cell = ws.cell(row=r, column=col)
            cell.border = BORDER
            cell.font = Font(name="Arial", size=9)
            if k == "sl":
                cell.value = '=IF(%s,"",COUNTA($%s$%d:$%s%d))' % (gate, struct_L, MAP_DATA_ROW, struct_L, r)
                cell.number_format = "0"
                cell.alignment = Alignment(horizontal="center")
            elif k == "variance":
                cell.value = '=IF(%s,"",N(%s%d)-N(%s%d))' % (gate, lab["plan_ftd"], r, lab["ach_ftd"], r)
            elif k == "ach_ftm":
                cell.value = '=IF(%s,"",N(%s%d)+N(%s%d))' % (gate, lab["ach_ftd"], r, lab["ach_ftm_prev"], r)
            elif k == "workdone":
                cell.value = '=IF(%s,"",N(%s%d)+N(%s%d))' % (gate, lab["last_month"], r, lab["ach_ftm"], r)
            elif k == "pct":
                cell.value = '=IF(OR(%s,N($%s%d)=0),"",%s%d/$%s%d)' % (
                    gate, lab["scope"], r, lab["workdone"], r, lab["scope"], r)
                cell.number_format = "0%"
            elif k == "balance":
                cell.value = '=IF(%s,"",N($%s%d)-N(%s%d))' % (gate, lab["scope"], r, lab["workdone"], r)
            else:
                pull = 'INDEX(%s,%d,%s$%d)' % (data_rng, rel, L, MAP_IDX_ROW)
                if k == "structure":
                    cell.value = '=IF(%s$%d=0,"",IFERROR(IF(%s="","",%s),""))' % (
                        L, MAP_IDX_ROW, pull, pull)
                elif kind == "num":
                    # vendor numbers arrive as text often enough to be worth handling
                    clean = 'SUBSTITUTE(SUBSTITUTE(TRIM(%s&""),",",""),CHAR(160),"")' % pull
                    cell.value = ('=IF(%s,"",IF(%s$%d=0,IF(%s$%d="","",%s$%d),'
                                  'IFERROR(--%s,"")))') % (
                        gate, L, MAP_IDX_ROW, L, MAP_FIXED_ROW, L, MAP_FIXED_ROW, clean)
                else:
                    cell.value = '=IF(%s,"",IF(%s$%d=0,%s$%d,IFERROR(%s&"","")))' % (
                        gate, L, MAP_IDX_ROW, L, MAP_FIXED_ROW, pull)

            if k in calc_keys:
                cell.fill = PatternFill("solid", fgColor=CALC_BG)
            elif k in ("area", "activity", "agency", "structure"):
                cell.fill = PatternFill("solid", fgColor=KEY_BG)
            else:
                cell.fill = PatternFill("solid", fgColor=CALC_BG)
            if kind in ("num", "formula") and k != "sl" and k != "pct":
                cell.number_format = '#,##0.00;[Red]-#,##0.00;"-"'
                cell.alignment = Alignment(horizontal="right")

    dv = DataValidation(type="list", formula1=hdr_rng, allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    for k, *_r in BACKUP_COLUMNS:
        if k not in calc_keys:
            dv.add("%s%d" % (lab[k], MAP_VCOL_ROW))
    _add_dv(ws, "=Areas", "%s%d" % (lab["area"], MAP_FIXED_ROW))
    _add_dv(ws, "=Activities", "%s%d" % (lab["activity"], MAP_FIXED_ROW))
    _add_dv(ws, "=Agencies", "%s%d" % (lab["agency"], MAP_FIXED_ROW))

    ws.freeze_panes = ws.cell(row=MAP_DATA_ROW, column=C["scope"])
    ws.sheet_view.zoomScale = 85
    return ws


SYNONYMS = {
    "structure":    "name of structure | structure | description | activity description | item | work description | particulars | building | location | element",
    "area":         "area | zone | unit | block | package | plant area | section",
    "activity":     "activity | discipline | work type | sub head | category of work",
    "agency":       "agency | contractor | vendor | sub contractor | agency/contractor | executing agency | party",
    "scope":        "scope | total scope | total qty | boq qty | contract qty | ordered qty | total quantity",
    "drawing":      "drawing released | drg released | drawings issued | gfc released | ifc released",
    "front":        "front available | cum front available | front | fronts released | work front",
    "last_month":   "achieved till last month | cum till last month | upto last month | progress till last month | opening balance",
    "plan_ftm":     "plan ftm | plan for the month | monthly plan | mtd plan | target for month | plan month",
    "plan_ftd":     "plan ftd | plan for the day | daily plan | today plan | dpr plan | plan today",
    "ach_ftd":      "achieved ftd | actual ftd | today achievement | progress today | daily progress | done today | qty today | achievement for the day",
    "ach_ftm_prev": "achieved ftm till previous date | mtd till previous day | month till yesterday | cum month previous",
    "reason":       "reason | reason for variance | remarks for variance | constraint | hold reason | delay reason",
    "remarks":      "remarks | comment | notes | observation",
    "manpower":     "manpower | available manpower | labour | workmen | man power | manpower deployed | strength",
}


def build_mapping(wb):
    ws = wb.create_sheet("Mapping")
    ws.sheet_properties.tabColor = "A9D08E"
    ws["B2"] = "COLUMN SYNONYM DICTIONARY  (auto-mapping of vendor headers)"
    ws["B2"].font = Font(name="Arial", size=13, bold=True, color=NAVY)
    ws["B3"] = ("Add any new header wording your vendors use, separated by ' | '. "
                "The HTML consolidator reads the very same list, so keep the two in step.")
    ws["B3"].font = Font(name="Arial", size=9, italic=True, color="595959")
    for i, h in enumerate(["Canonical field", "Standard header", "Accepted vendor headings (| separated)"]):
        c = ws.cell(row=5, column=2 + i, value=h)
        c.fill = PatternFill("solid", fgColor=HDR_BLUE)
        c.font = Font(name="Arial", size=9, bold=True, color="FFFFFF")
        c.border = BORDER
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 30
    ws.column_dimensions["D"].width = 110
    head_by_key = {k: h for k, l, h, w, kd in BACKUP_COLUMNS}
    r = 6
    for k, syn in SYNONYMS.items():
        ws.cell(row=r, column=2, value=k).font = Font(name="Consolas", size=9)
        ws.cell(row=r, column=3, value=head_by_key.get(k, k)).font = Font(name="Arial", size=9, bold=True)
        c = ws.cell(row=r, column=4, value=syn)
        c.font = Font(name="Arial", size=9)
        c.fill = PatternFill("solid", fgColor=INPUT_BG)
        for col in range(2, 5):
            ws.cell(row=r, column=col).border = BORDER
        r += 1

    ws.cell(row=r + 2, column=2, value="NAME ALIASES  (vendor wording  ->  master wording)").font = \
        Font(name="Arial", size=12, bold=True, color=NAVY)
    hr = r + 3
    for i, h in enumerate(["Type (area/activity/agency/structure)", "As written by the vendor", "Master value to use"]):
        c = ws.cell(row=hr, column=2 + i, value=h)
        c.fill = PatternFill("solid", fgColor=HDR_BLUE)
        c.font = Font(name="Arial", size=9, bold=True, color="FFFFFF")
        c.border = BORDER
    examples = [("agency", "ITD Cementation Ltd.", "ITD Cementation"),
                ("agency", "M/s Meher Foundations Pvt Ltd", "Meher Foundation"),
                ("area", "FILTRATION", "Filtration Unit"),
                ("area", "WTP", "Water Treatment Plant")]
    for i in range(300):
        rr = hr + 1 + i
        vals = examples[i] if i < len(examples) else ("", "", "")
        for j, v in enumerate(vals):
            c = ws.cell(row=rr, column=2 + j, value=v or None)
            c.fill = PatternFill("solid", fgColor=INPUT_BG)
            c.border = BORDER
            c.font = Font(name="Arial", size=9)
    return ws


def build_readme(wb):
    ws = wb.create_sheet("READ ME", 0)
    ws.sheet_properties.tabColor = "FFC000"
    ws.column_dimensions["B"].width = 120
    lines = [
        ("JSW UTKAL STEEL  —  DAILY PROGRESS REPORT  (consolidation workbook)", 15, True, NAVY),
        ("", 10, False, "000000"),
        ("HOW THE PIECES FIT TOGETHER", 12, True, "C00000"),
        ("1.  dpr_consolidator.html  — open it in Chrome/Edge.  Drop in every vendor DPR you receive", 10, False, "000000"),
        ("     (any layout, .xlsx / .xls / .csv).  It auto-detects the header row, maps the vendor's", 10, False, "000000"),
        ("     column names to this format, matches each line to your master scope, and exports the", 10, False, "000000"),
        ("     finished DPR in exactly the format of this workbook.", 10, False, "000000"),
        ("2.  This workbook — the approved format.  Use it as (a) the master-scope source you load into", 10, False, "000000"),
        ("     the HTML tool, and (b) the manual fallback if you would rather type the numbers in.", 10, False, "000000"),
        ("", 10, False, "000000"),
        ("SHEETS", 12, True, "C00000"),
        ("Config             Project title, data date, reporting date, and the master drop-down lists.", 10, False, "000000"),
        ("Summary-AreaWise   The printed summary.  Every number is a SUMIFS() pulled from the backup", 10, False, "000000"),
        ("                   sheets.  Fill only the green columns (Activity, Agency) plus the two grey", 10, False, "000000"),
        ("                   helper columns P (Area) and Q (Source sheet) - they tell the formula where", 10, False, "000000"),
        ("                   to look.  Columns P and Q are outside the print area.", 10, False, "000000"),
        ("Piling … Panels    Backup sheets, one per discipline, identical column layout.", 10, False, "000000"),
        ("Manpower           Area / agency / category-wise deployment.", 10, False, "000000"),
        ("1-Paste vendor     Paste any vendor's table here, header row on row 5.", 10, False, "000000"),
        ("2-Map and convert  Pick which pasted column is which - a suggestion is pre-filled -", 10, False, "000000"),
        ("                   and it rebuilds the rows in the approved order, ready to copy into", 10, False, "000000"),
        ("                   the discipline sheet.  Row 6 supplies anything the vendor omitted.", 10, False, "000000"),
        ("Mapping            Header synonyms + name aliases.  Teach it once, it remembers forever.", 10, False, "000000"),
        ("", 10, False, "000000"),
        ("COLOUR CODE", 12, True, "C00000"),
        ("Yellow  = you type here.      Green = key / matching column (must match the master exactly).", 10, False, "000000"),
        ("Blue    = calculated, do not overwrite.", 10, False, "000000"),
        ("", 10, False, "000000"),
        ("THE ARITHMETIC  (unchanged from your existing DPR)", 12, True, "C00000"),
        ("Variance for the Day      n = Plan FTD  -  Achieved FTD", 10, False, "000000"),
        ("Achieved FTM till date    p = Achieved FTD  +  Achieved FTM till previous date", 10, False, "000000"),
        ("Workdone Till Date        q = Achieved till last month  +  Achieved FTM till date", 10, False, "000000"),
        ("% Complete                r = Workdone Till Date  /  Scope", 10, False, "000000"),
        ("Balance                   s = Scope  -  Workdone Till Date", 10, False, "000000"),
        ("", 10, False, "000000"),
        ("WHAT CHANGED vs. YOUR CURRENT FILE", 12, True, "C00000"),
        ("Formulas are pre-filled 400 rows deep on each backup sheet and 150 rows deep on the summary.", 10, False, "000000"),
        ("Need more?  Select the last filled row and drag it down - nothing else has to change.", 10, False, "000000"),
        ("", 10, False, "000000"),
        ("Two real columns - Area and Activity - were added to each backup sheet.  In the current file", 10, False, "000000"),
        ("the area is only a bold heading row, so the Summary SUMIFS() has to hard-code row numbers", 10, False, "000000"),
        ("(Structural!H89:H106).  Insert one row anywhere and the summary silently breaks.  With Area and", 10, False, "000000"),
        ("Activity as columns the formulas address whole columns and never need maintenance.", 10, False, "000000"),
    ]
    for i, (txt, size, bold, colr) in enumerate(lines):
        c = ws.cell(row=2 + i, column=2, value=txt or None)
        c.font = Font(name="Consolas" if txt.startswith(("Config", "Summary", "Piling", "Manpower",
                                                          "Vendor", "Mapping", "Variance", "Achieved",
                                                          "Workdone", "% Comp", "Balance")) else "Arial",
                      size=size, bold=bold, color=colr)
    ws.sheet_view.showGridLines = False
    return ws


def main(out="JSW_DPR_Template.xlsx"):
    wb = Workbook()
    wb.remove(wb.active)
    build_config(wb)
    for sheet, act, uom in DISCIPLINES:
        build_backup(wb, sheet, act, uom)
    build_manpower(wb)
    build_summary(wb)
    build_paste(wb)
    build_map(wb)
    build_mapping(wb)
    build_readme(wb)
    order = ["READ ME", "Summary-AreaWise"] + [d[0] for d in DISCIPLINES] + \
            ["Manpower", "1-Paste vendor data", "2-Map and convert", "Mapping", "Config"]
    wb._sheets = [wb[n] for n in order]
    wb.save(out)
    print("written:", out, "| sheets:", len(order))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "JSW_DPR_Template.xlsx")

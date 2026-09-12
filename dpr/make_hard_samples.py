# -*- coding: utf-8 -*-
"""Deliberately nasty vendor DPRs — the shapes that actually break parsers.

Each file exercises a different failure mode:
  A  merged area cells, merged 2-row group header, letter-code row,
     numbers stored as text, NIL / - / N.A. blanks, per-area sub totals
  B  two independent tables stacked in one sheet, each with its own header
  C  12 rows of preamble, serial column, UOM and % columns, junk footer
  D  csv with a BOM, quoted fields, Indian digit grouping, blank spacer rows
  E  abbreviated + misspelt structure names, to test the matcher
"""
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter as CL
import csv, os

os.makedirs("samples-hard", exist_ok=True)
B = Font(bold=True)


def style_hdr(ws, row, n, start=1):
    for i in range(n):
        c = ws.cell(row=row, column=start + i)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="305496")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


# ---------------------------------------------------------------- A
def vendor_a(path):
    wb = Workbook(); ws = wb.active; ws.title = "DPR"
    ws.merge_cells("A1:N1"); ws["A1"] = "MEHER FOUNDATION PVT LTD"
    ws["A1"].font = Font(bold=True, size=14); ws["A1"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A2:N2"); ws["A2"] = "Daily Progress Report - Piling Works - JSW Utkal Phase 1"
    ws["A2"].alignment = Alignment(horizontal="center")
    ws["A3"] = "Date"; ws["B3"] = "11.09.2026"

    # two-row header with MERGED group headers (only top-left carries the text)
    ws.merge_cells("A5:A6"); ws["A5"] = "Sl No"
    ws.merge_cells("B5:B6"); ws["B5"] = "Area"
    ws.merge_cells("C5:C6"); ws["C5"] = "Description of Structure"
    ws.merge_cells("D5:D6"); ws["D5"] = "Unit"
    ws.merge_cells("E5:E6"); ws["E5"] = "Total Scope"
    ws.merge_cells("F5:G5"); ws["F5"] = "Released"
    ws["F6"] = "Drawing"; ws["G6"] = "Front"
    ws.merge_cells("H5:H6"); ws["H5"] = "Cum. upto 31.08.2026"
    ws.merge_cells("I5:J5"); ws["I5"] = "Plan"
    ws["I6"] = "Month"; ws["J6"] = "Day"
    ws.merge_cells("K5:L5"); ws["K5"] = "Actual"
    ws["K6"] = "Day"; ws["L6"] = "Month upto 10.09.26"
    ws.merge_cells("M5:M6"); ws["M5"] = "Reason for slippage"
    ws.merge_cells("N5:N6"); ws["N5"] = "Remarks"
    style_hdr(ws, 5, 14); style_hdr(ws, 6, 14)
    # the JSW-style letter-code row
    for i, l in enumerate("abcdefghijklmn"):
        c = ws.cell(row=7, column=1 + i, value=l); c.font = Font(italic=True, size=8)

    rows = [
        # area is written once and MERGED down over its rows
        ("Filtration Unit", 3, [
            ("Filtration Main Building (Part-1)", "Nos", "893", "893", "893", "880", "15", "2", "3", "10", "", ""),
            ("Filtration Main Building (Part-2)", "Nos", "659", "659", "659", "650", "10", "1", "2", "7", "", ""),
            ("Intermediate slurry agitator tank (Part-2)", "Nos", "34", "34", "34", "34", "-", "-", "NIL", "-", "", "Completed"),
        ]),
        ("Material Handling Facilities", 4, [
            ("Conveyor gallery J1C1 & J1C2", "Nos", "1,188", "1,188", "1,188", "1,100", "60", "4", "6", "22", "rebar shortage", ""),
            ("JH7C1C2", "Nos", "2,214", "2,214", "2,214", "1,890", "180", "12", "9", "70", "crane breakdown", "watch"),
            ("TT0C1C2 drive house", "Nos", "324", "324", "324", "324", "N.A.", "N.A.", "-", "-", "", "Completed"),
            ("JH6", "Nos", "1,136", "1,136", "1,136", "1,095", "25", "2", "4", "15", "", ""),
        ]),
    ]
    r = 8
    for area, n, items in rows:
        first = r
        for it in items:
            ws.cell(row=r, column=1, value=r - 7)
            for i, v in enumerate(it):
                ws.cell(row=r, column=3 + i, value=v)
            r += 1
        ws.merge_cells(start_row=first, start_column=2, end_row=r - 1, end_column=2)
        ws.cell(row=first, column=2, value=area).alignment = Alignment(vertical="center")
        # per-area sub total
        ws.cell(row=r, column=3, value="Sub Total : " + area).font = B
        for col, v in ((5, sum(int(str(i[2]).replace(",", "")) for i in items)),):
            ws.cell(row=r, column=col, value=v).font = B
        r += 1
    ws.cell(row=r, column=3, value="GRAND TOTAL").font = B
    ws.cell(row=r, column=5, value=6448).font = B
    r += 2
    ws.cell(row=r, column=3, value="Prepared by : Site Engineer")
    ws.cell(row=r + 1, column=3, value="Signature")
    for col, w in zip("ABCDEFGHIJKLMN", [6, 22, 38, 7, 11, 10, 10, 14, 9, 9, 9, 14, 20, 16]):
        ws.column_dimensions[col].width = w
    wb.save(path); print("wrote", path)


# ---------------------------------------------------------------- B
def vendor_b(path):
    wb = Workbook(); ws = wb.active; ws.title = "Consolidated"
    ws["A1"] = "VENSAR CONSTRUCTIONS - CONSOLIDATED DAILY REPORT"; ws["A1"].font = Font(bold=True, size=13)
    ws["A2"] = "Reporting date : 11-Sep-2026"

    def block(start, title, hdr, data):
        ws.cell(row=start, column=1, value=title).font = Font(bold=True, size=12)
        for i, h in enumerate(hdr):
            ws.cell(row=start + 1, column=1 + i, value=h)
        style_hdr(ws, start + 1, len(hdr))
        r = start + 2
        for d in data:
            for i, v in enumerate(d):
                ws.cell(row=r, column=1 + i, value=v)
            r += 1
        return r

    r = block(4, "A.  CIVIL WORKS  (Cum)",
              ["S.No", "Zone", "Name of work", "Total Qty", "Drg. Released", "Front Avl",
               "Upto last month", "Target this month", "Target today", "Achieved today",
               "Achieved this month till yesterday", "Constraint"],
              [(1, "Water Treatment Plant", "Pump House with sump & pump", 4400, 3900, 3900, 1853, 400, 20, 18, 60, "shuttering"),
               (2, "Water Treatment Plant", "Clarifier 2", 1350, 1350, 1350, 0, 200, 10, 0, 0, "front not released"),
               (3, "Stacker & Reclaimer", "Stacker (Filtration Side) 1-8", 6836, 6836, 6836, 5283, 500, 25, 30, 90, ""),
               (4, "Roads & Drains", "Road and drains (20mtr width)-2km", 6450, 0, 0, 0, 0, 0, 0, 0, "drawing awaited"),
               ("", "", "Total", 19036, 12086, 12086, 7136, 1100, 55, 48, 150, "")])
    r = block(r + 2, "B.  STRUCTURAL ERECTION  (MT)",
              ["Sr", "Area", "Structure", "Scope MT", "Drawing", "Front", "Till last month",
               "Plan FTM", "Plan FTD", "Actual FTD", "Actual FTM (prev)", "Remarks"],
              [(1, "Filtration Unit", "Filtration Main Building - TS", 636, 636, 636, 220, 120, 6, 5, 30, ""),
               (2, "Material Handling Facilities", "Junction House JH02 - BS", 3622, 3587, 2686, 1200, 300, 15, 12, 70, ""),
               (3, "Water Treatment Plant", "Pipe Rack WTP - TS", 3096, 3096, 2872, 806, 200, 10, 11, 45, "")])
    for col, w in zip("ABCDEFGHIJKL", [6, 24, 36, 11, 12, 10, 13, 13, 12, 12, 16, 18]):
        ws.column_dimensions[col].width = w
    wb.save(path); print("wrote", path)


# ---------------------------------------------------------------- C
def vendor_c(path):
    wb = Workbook(); ws = wb.active; ws.title = "Sheet1"
    pre = ["GOEL CONSTRUCTIONS PVT. LTD.", "", "Client : JSW Utkal Steel Limited",
           "Project : Phase-1 Greenfield Expansion", "Package : Civil Works - WTP & MHS",
           "Contract No. : JUSL/CIV/2024/117", "", "DAILY PROGRESS REPORT", "",
           "Data date", "11-Sep-2026", ""]
    for i, t in enumerate(pre):
        ws.cell(row=1 + i, column=2, value=t or None)
    ws["B8"].font = Font(bold=True, size=13)
    hdr = ["Sl.", "Description", "Location", "UOM", "Qty as per BOQ", "GFC Drawing",
           "Front Handed Over", "Progress upto last month", "Monthly Target",
           "Daily Target", "Progress for the day", "Progress this month (till previous day)",
           "% Completion", "Manpower", "Remarks"]
    for i, h in enumerate(hdr):
        ws.cell(row=13, column=2 + i, value=h)
    style_hdr(ws, 13, len(hdr), start=2)
    data = [
        (1, "Chemical Dosing Building & MCC (200+250)", "Water Treatment Plant", "Cum", 450, 250, 250, 0, 60, 3, 2, 8, 0.018, 14, ""),
        (2, "UF RO Shed", "Water Treatment Plant", "Cum", 400, 0, 0, 0, 0, 0, 0, 0, 0, 0, "drawing awaited"),
        (3, "Buffer thickner", "Water Treatment Plant", "Cum", 1700, 1450, 1450, 406, 250, 12, 14, 40, 0.27, 44, ""),
        (4, "Pump for thickner", "Water Treatment Plant", "Cum", 51, 51, 51, 20, 15, 1, 1, 4, 0.49, 3, ""),
        (5, "RO Feed Tank, waste water and reject tank", "Water Treatment Plant", "Cum", 775, 775, 500, 0, 90, 4, 3, 12, 0.019, 18, ""),
        (6, "Stacker (Filtration Side) 1-8", "Stacker & Reclaimer", "Cum", 6836, 6836, 6836, 5283, 500, 25, 22, 88, 0.79, 128, ""),
    ]
    r = 14
    for d in data:
        for i, v in enumerate(d):
            ws.cell(row=r, column=2 + i, value=v)
        ws.cell(row=r, column=15).number_format = "0.0%"
        r += 1
    ws.cell(row=r + 1, column=3, value="Note : quantities are cumulative")
    ws.cell(row=r + 2, column=3, value="Prepared by")
    ws.cell(row=r + 2, column=6, value="Checked by")
    for col, w in zip("BCDEFGHIJKLMNOP", [5, 40, 24, 7, 12, 11, 12, 14, 12, 11, 13, 16, 11, 10, 18]):
        ws.column_dimensions[col].width = w
    wb.save(path); print("wrote", path)


# ---------------------------------------------------------------- D
def vendor_d(path):
    rows = [
        ["ITD CEMENTATION INDIA LIMITED"], [],
        ["Piling works - daily report", "", "11/09/2026"], [],
        ["Sr.No", "Structure Name", "Area", "Nos. of piles", "Drawings released",
         "Front available", "Completed till 31.08.26", "Plan for Sep'26",
         "Plan for today", "Completed today", "Completed in Sep till 10.09"],
        [1, "Electrical Sub-station, Filtration", "Filtration Unit", "406", "406", "406", "400", "10", "2", "3", "4"],
        [2, "IO Terminal (terminal agitator tank)", "Filtration Unit", "1,576", "1,576", "1,576", "1,570", "12", "1", "2", "3"],
        [],
        [3, "Cooling Tower", "Water Treatment Plant", "99", "99", "99", "95", "6", "1", "2", "2"],
        [4, "Cable Gallery IO RMHS Area Route 1,2,3", "Water Treatment Plant", "40", "40", "40", "38", "3", "1", "1", "1"],
        ["", "Total", "", "2,121", "2,121", "2,121", "2,103", "31", "5", "8", "10"],
    ]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        csv.writer(f, quoting=csv.QUOTE_MINIMAL).writerows(rows)
    print("wrote", path)


# ---------------------------------------------------------------- E
def vendor_e(path):
    """Same scope as the master, but written the way a site engineer types it."""
    wb = Workbook(); ws = wb.active; ws.title = "Progress"
    hdr = ["Sl", "Structure", "Area", "Agency", "Scope", "Drg", "Front",
           "Till last mnth", "Plan mnth", "Plan day", "Done today", "Done mnth till prev"]
    for i, h in enumerate(hdr):
        ws.cell(row=1, column=1 + i, value=h)
    data = [
        ("Fltration Main Bldg (P-1)", "Filtration", "M/s Meher Foundations Pvt. Ltd.", 893, 893, 893, 880, 15, 2, 3, 10),
        ("Conv. Gallery J1C1-J1C2", "MHS", "Meher Foundation", 1188, 1188, 1188, 1100, 60, 4, 6, 22),
        ("JH-02", "MHS", "Meher Foundation", 151, 151, 151, 140, 14, 2, 4, 6),
        ("Interm. slurry agitator tk (Part 2)", "Filtration", "Meher Foundation", 34, 34, 34, 34, 0, 0, 0, 0),
        ("Elect. Sub-stn RMHS", "Filtration", "Meher Foundation", 6, 6, 6, 6, 0, 0, 0, 0),
    ]
    for j, d in enumerate(data):
        ws.cell(row=2 + j, column=1, value=j + 1)
        for i, v in enumerate(d):
            ws.cell(row=2 + j, column=2 + i, value=v)
    wb.save(path); print("wrote", path)


vendor_a("samples-hard/Meher Foundation - Piling DPR 11.09.2026.xlsx")
vendor_b("samples-hard/Vensar Consolidated Daily Report 11-09-2026.xlsx")
vendor_c("samples-hard/Goel Constructions DPR.xlsx")
vendor_d("samples-hard/ITD Piling 11-09-2026.csv")
vendor_e("samples-hard/site engineer sheet.xlsx")

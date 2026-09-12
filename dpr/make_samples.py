# -*- coding: utf-8 -*-
"""Three deliberately mismatched vendor DPRs, to exercise the consolidator."""
import csv, random
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

random.seed(7)

# ---------------------------------------------------------------- vendor 1
# ITD Cementation: title rows, area rows as bold section headings, own wording
def vendor1(path):
    wb = Workbook(); ws = wb.active; ws.title = "Piling Progress"
    ws["B2"] = "ITD CEMENTATION (INDIA) LIMITED"
    ws["B3"] = "Daily Progress - Piling Works - JSW Utkal"
    ws["B4"] = "Date : 11-Sep-2026"
    hdr = ["Sr No", "Description of Work", "Contract Qty (Nos)", "GFC Released",
           "Work Front", "Cum. upto last month", "Monthly Target", "Today Plan",
           "Progress Today", "MTD till previous day", "Remark"]
    for i, h in enumerate(hdr):
        c = ws.cell(row=6, column=2 + i, value=h)
        c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="1F4E79")
        c.alignment = Alignment(wrap_text=True, horizontal="center")
    data = [
        ("__AREA__", "Filtration Unit"),
        (1, "Electrical Substation Filtration", 406, 406, 406, 400, 10, 2, 3, 4, ""),
        (2, "Electrical Substation RMHS", 6, 6, 6, 6, 0, 0, 0, 0, "Completed"),
        (3, "IO Terminal (terminal agitator tank)", 1576, 1576, 1576, 1570, 12, 1, 2, 3, ""),
        ("__AREA__", "Material handling facilities"),
        (4, "Conveyor gallery J1C1 to J1C2", 188, 188, 188, 180, 10, 2, 3, 5, ""),
        (5, "JH02", 151, 151, 151, 140, 14, 2, 4, 6, "rebar delay"),
        (6, "JH7C1C2", 214, 214, 214, 189, 30, 3, 6, 9, ""),
        ("__AREA__", "Water Treatment Plant"),
        (7, "Cooling Tower", 99, 99, 99, 95, 6, 1, 2, 2, ""),
        (8, "Cable Gallery IO RMHS Area Route 1,2,3", 40, 40, 40, 38, 3, 1, 1, 1, ""),
        ("__TOTAL__", "Total", 2680, 2680, 2680, 2618, 85, 12, 21, 30, ""),
    ]
    r = 7
    for row in data:
        if row[0] == "__AREA__":
            c = ws.cell(row=r, column=3, value=row[1]); c.font = Font(bold=True, italic=True)
        elif row[0] == "__TOTAL__":
            for i, v in enumerate(row[1:]): ws.cell(row=r, column=2 + i + 1, value=v)
            ws.cell(row=r, column=3).font = Font(bold=True)
        else:
            for i, v in enumerate(row): ws.cell(row=r, column=2 + i, value=v)
        r += 1
    for col, w in zip("BCDEFGHIJKL", [7, 40, 13, 12, 11, 15, 13, 11, 13, 16, 18]):
        ws.column_dimensions[col].width = w
    wb.save(path); print("wrote", path)

# ---------------------------------------------------------------- vendor 2
# Vensar: plain CSV, header on the very first line, completely different wording
def vendor2(path):
    hdr = ["S.No", "Structure", "Area", "Agency", "BOQ Quantity (Cum)", "Drawing Issued",
           "Front Released", "Upto Last Month", "Plan for the Month", "Daily Plan",
           "Achieved for the Day", "MTD Previous", "Reason for variance", "Remark", "Labour"]
    rows = [
        [1, "Pump House with sump & pump", "Water Treatment Plant", "Vensar Constructions",
         4400, 3900, 3900, 1853, 400, 20, 18, 60, "shuttering shortage", "", 64],
        [2, "Clarifier 2", "Water Treatment Plant", "Vensar Constructions",
         1350, 1350, 1350, 0, 200, 10, 0, 0, "front not released", "", 12],
        [3, "Stacker (Filtration Side) 1-8", "Stacker & Reclaimer", "Vensar Constructions",
         6836, 6836, 6836, 5283, 500, 25, 30, 90, "", "ahead of plan", 128],
        [4, "Road and drains (20mtr width) 2km", "Roads & Drains", "Vensar Constructions",
         6450, 0, 0, 0, 0, 0, 0, 0, "drawing awaited", "", 0],
        [5, "Roads and Drains (9mtr width) 1.5Km", "Roads & Drains", "Vensar Constructions",
         6000, 0, 0, 0, 0, 0, 0, 0, "drawing awaited", "", 0],
        [6, "Chiller Plant", "Water Treatment Plant", "Vaishnavi", 600, 600, 600, 168, 120, 6, 7, 22, "", "", 31],
        [7, "Cooling Tower-1", "Water Treatment Plant", "Vaishnavi", 350, 350, 350, 0, 60, 3, 2, 5, "", "", 9],
        [8, "Buffer thickner", "Water Treatment Plant", "Goel Constructions",
         1700, 1450, 1450, 406, 250, 12, 14, 40, "", "", 44],
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(hdr); w.writerows(rows)
    print("wrote", path)

# ---------------------------------------------------------------- vendor 3
# ARDEE: two-row merged header, supply & erection on two sheets, MT
def vendor3(path):
    wb = Workbook()
    for sheet, act, scale in (("Supply", "Structural Supply (MT)", 1.0),
                              ("Erection", "Structural Erection (MT)", 0.55)):
        ws = wb.create_sheet(sheet) if sheet != "Supply" else wb.active
        ws.title = sheet
        ws["A1"] = "ARDEE Engineering Pvt Ltd  |  Structural " + sheet + "  |  JSW Utkal Phase-1"
        ws["A2"] = "Reporting date: 11-Sep-26"
        top = ["Sl", "Item", "Zone", "Qty", "Drawings", "Front", "Cumulative", "Plan", "Plan",
               "Actual", "Actual", "Remarks"]
        sub = ["", "Description", "", "Total MT", "Released", "Available", "till last month",
               "Month", "Day", "Day", "Month till prev", ""]
        for i, (t, s) in enumerate(zip(top, sub)):
            ws.cell(row=4, column=1 + i, value=t).font = Font(bold=True)
            ws.cell(row=5, column=1 + i, value=s).font = Font(bold=True, italic=True)
        items = [
            ("BS - Filtration Main Building", "Filtration Unit", 2675, 2443, 1264, 700, 500, 22, 26, 61),
            ("TS - Filtration Main Building", "Filtration Unit", 636, 636, 636, 400, 328, 14, 15, 25),
            ("BS - Junction House JH02", "Material Handling Facilities", 3622, 3587, 2686, 2100, 697, 30, 34, 98),
            ("BS - Conveyor Gallery J2C1", "Material Handling Facilities", 4611, 3561, 1863, 900, 588, 26, 28, 72),
            ("TS - Pipe Rack WTP", "Water Treatment Plant", 3096, 3096, 2872, 780, 440, 20, 18, 52),
        ]
        for j, (nm, zone, qty, drg, front, cum, pm, pd, ad, mprev) in enumerate(items):
            r = 6 + j
            vals = [j + 1, nm, zone, round(qty * scale), round(drg * scale), round(front * scale),
                    round(cum * scale), round(pm * scale), round(pd * scale),
                    round(ad * scale), round(mprev * scale), ""]
            for i, v in enumerate(vals): ws.cell(row=r, column=1 + i, value=v)
        for col, w in zip("ABCDEFGHIJKL", [5, 36, 26, 10, 11, 11, 13, 10, 9, 9, 14, 16]):
            ws.column_dimensions[col].width = w
    wb.save(path); print("wrote", path)


vendor1("samples/ITD Cementation - Piling DPR 11.09.2026.xlsx")
vendor2("samples/Vensar Civil Daily Report 11-09-2026.csv")
vendor3("samples/ARDEE Structural DPR 11Sep26.xlsx")

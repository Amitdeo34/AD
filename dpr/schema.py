# -*- coding: utf-8 -*-
"""
Canonical DPR schema.  This file is the SINGLE SOURCE OF TRUTH for the
column layout used by:
    * build_template.py   -> JSW_DPR_Template.xlsx
    * dpr_consolidator.html (a JS copy of these tables lives in the HTML)

Layout mirrors the approved JSW Utkal Steel DPR format.  Two columns were
added to the backup sheets (Area, Activity) because the original workbook
carried Area only as a visual section-heading row, which makes the
Summary-AreaWise SUMIFS() roll-up fragile.
"""

# ---------------------------------------------------------------- backup sheets
# (key, letter, header, width, kind)
#   kind: 'text' | 'num' | 'pct' | 'formula'
BACKUP_COLUMNS = [
    ("sl",            "a", "SL.",                          6,  "num"),
    ("structure",     "b", "Name of the Structures",       38, "text"),
    ("area",          "c", "Area",                         22, "text"),
    ("activity",      "d", "Activity",                     24, "text"),
    ("agency",        "e", "Agency / Contractor",          22, "text"),
    ("scope",         "f", "Scope",                        11, "num"),
    ("drawing",       "g", "Drawing Released",             12, "num"),
    ("front",         "h", "Cum Front Available",          12, "num"),
    ("last_month",    "i", "Achieved till last month",     13, "num"),
    ("plan_ftm",      "j", "Plan FTM",                     11, "num"),
    ("plan_ftd",      "k", "Plan FTD",                     11, "num"),
    ("ach_ftd",       "l", "Achieved FTD",                 11, "num"),
    ("ach_ftm_prev",  "m", "Achieved FTM till previous date", 13, "num"),
    ("variance",      "n", "Variance for the Day",         12, "formula"),
    ("reason",        "o", "Reason(s) for Variance",       26, "text"),
    ("ach_ftm",       "p", "Achieved FTM till date",       13, "formula"),
    ("workdone",      "q", "Workdone Till Date",           13, "formula"),
    ("pct",           "r", "% Complete",                   10, "formula"),
    ("balance",       "s", "Balance",                      11, "formula"),
    ("remarks",       "t", "Remarks",                      30, "text"),
    ("manpower",      "u", "Available Manpower",           11, "num"),
]

# letter-code caption printed under each header (row 8), as in the original file
BACKUP_CODES = {
    "variance": "n = k-l",
    "ach_ftm":  "p = l+m",
    "workdone": "q = i+p",
    "pct":      "r = (q/f)x100",
    "balance":  "s = f-q",
}

COL_INDEX = {k: i + 2 for i, (k, *_rest) in enumerate(BACKUP_COLUMNS)}  # sheet starts at col B

HDR_ROW   = 7
CODE_ROW  = 8
DATA_ROW  = 9
MAX_ROWS  = 400

# ---------------------------------------------------------------- summary sheet
SUMMARY_COLUMNS = [
    ("sl",        "a", "SI No.",              7,  "text"),
    ("activity",  "b", "Area / Activities",   40, "text"),
    ("agency",    "c", "Agency / Contractor", 24, "text"),
    ("scope",     "d", "Scope",               12, "num"),
    ("drawing",   "e", "Drawing Released",    12, "num"),
    ("front",     "f", "Front Available",     12, "num"),
    ("workdone",  "g", "Workdone Till Date",  12, "num"),
    ("pct",       "h", "% Complete",          11, "pct"),
    ("balance",   "i", "Balance",             12, "num"),
    ("plan_ftm",  "j", "Plan for {MON}",      12, "num"),
    ("ach_ftm",   "k", "Achieved for {MON}",  12, "num"),
    ("ach_ftd",   "l", "Achieved FTD",        12, "num"),
    ("manpower",  "m", "Available Manpower",  12, "num"),
]
SUMMARY_CODES = {"pct": "h = (g/d)x100", "balance": "i = d-g"}

# summary field  ->  backup-sheet field it sums
SUMMARY_SOURCE = {
    "scope": "scope", "drawing": "drawing", "front": "front",
    "workdone": "workdone", "plan_ftm": "plan_ftm",
    "ach_ftm": "ach_ftm", "ach_ftd": "ach_ftd", "manpower": "manpower",
}

# ---------------------------------------------------------------- disciplines
# (sheet name, default activity label, uom)
DISCIPLINES = [
    ("Piling",          "Piling Works (Nos)",       "Nos"),
    ("Civil",           "Civil Works (Cum)",        "Cum"),
    ("Structural",      "Structural Supply (MT)",   "MT"),
    ("Equipment",       "Equipment Erection (MT)",  "MT"),
    ("Piping",          "Piping (Inch-Mtr)",        "Inch-Mtr"),
    ("Cable Trays (Km)","Cable Trays (Km)",         "Km"),
    ("Cabling (Km)",    "Cabling (Km)",             "Km"),
    ("Panels (Nos)",    "Panels (Nos)",             "Nos"),
]

# extra activity labels offered in the drop-downs (Structural is split)
EXTRA_ACTIVITIES = {
    "Structural": ["Structural Supply (MT)", "Structural Erection (MT)"],
    "Equipment":  ["Equipment Supply (MT)",  "Equipment Erection (MT)"],
}

# ---------------------------------------------------------------- manpower sheet
MANPOWER_COLUMNS = [
    ("sl",      "a", "SL.",                 6,  "num"),
    ("area",    "b", "Area",                24, "text"),
    ("agency",  "c", "Agency / Contractor", 26, "text"),
    ("category","d", "Category",            22, "text"),
    ("planned", "e", "Planned (Nos)",       13, "num"),
    ("actual",  "f", "Actual / Available (Nos)", 15, "num"),
    ("variance","g", "Variance",            12, "formula"),
    ("remarks", "h", "Remarks",             30, "text"),
]

DEFAULT_AREAS = [
    "Filtration Unit", "Water Treatment Plant", "Material Handling Facilities",
    "Stacker & Reclaimer", "Substation", "Tanks & Launders (IDT)",
    "Dump Pond & Terminal", "Roads & Drains", "Plant General",
]

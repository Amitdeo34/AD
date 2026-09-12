"""Prove the cross-sheet formulas point at the columns they claim to.

A one-letter offset is the easiest way to break a DPR silently, so every
formula is re-read and checked against the header text it lands on.
"""
import re, sys
from openpyxl import load_workbook

wb = load_workbook('JSW_DPR_Template.xlsx')
bk = wb['Piling']
hdr = {c.column_letter: c.value for c in bk[7] if c.value}
print('Piling header row 7:')
for k in sorted(hdr, key=lambda x: (len(x), x)): print('   %-3s %s' % (k, hdr[k]))

fail = []
def want(letter, text, ctx):
    got = hdr.get(letter)
    if got != text: fail.append('%s: column %s is %r, expected %r' % (ctx, letter, got, text))

# ---- summary SUMIFS ------------------------------------------------------
sm = wb['Summary-AreaWise']
smh = {c.column_letter: c.value for c in sm[6] if c.value}
expect = {'E': 'Scope', 'F': 'Drawing Released', 'G': 'Front Available',
          'H': 'Workdone Till Date', 'K': 'Plan for the Month',
          'L': 'Achieved for the Month', 'M': 'Achieved FTD', 'N': 'Available Manpower'}
src_expect = {'E': 'Scope', 'F': 'Drawing Released', 'G': 'Cum Front Available',
              'H': 'Workdone Till Date', 'K': 'Plan FTM',
              'L': 'Achieved FTM till date', 'M': 'Achieved FTD', 'N': 'Available Manpower'}
for col in expect:
    f = sm['%s8' % col].value
    m = re.search(r"SUMIFS\(INDIRECT\(\"'\"&\$Q8&\"'!\$([A-Z]+)\$\d+:", f)
    crit = re.findall(r"INDIRECT\(\"'\"&\$Q8&\"'!\$([A-Z]+)\$\d+:\$[A-Z]+\$\d+\"\),(\$[A-Z]+8)", f)
    want(m.group(1), src_expect[col], 'summary %s sums' % col)
    got = [(a, b) for a, b in crit]
    if got != [('D', '$P8'), ('E', '$C8'), ('F', '$D8')]:
        fail.append('summary %s criteria are %s, expected D/$P8 (Area), E/$C8 (Activity), F/$D8 (Agency)' % (col, got))

# the criteria columns must really be Area / Activity / Agency
want('D', 'Area', 'criteria 1'); want('E', 'Activity', 'criteria 2')
want('F', 'Agency / Contractor', 'criteria 3')
if smh.get('P') != 'Area  (helper)': fail.append('summary helper P is %r' % smh.get('P'))
if smh.get('Q') != 'Source sheet  (helper)': fail.append('summary helper Q is %r' % smh.get('Q'))

# ---- backup-sheet derived columns ---------------------------------------
checks = [('O9', 'L9-M9', ['Plan FTD', 'Achieved FTD'], 'Variance for the Day'),
          ('Q9', 'M9+N9', ['Achieved FTD', 'Achieved FTM till previous date'], 'Achieved FTM till date'),
          ('R9', 'J9+Q9', ['Achieved till last month', 'Achieved FTM till date'], 'Workdone Till Date'),
          ('S9', 'R9/$G9', ['Workdone Till Date', 'Scope'], '% Complete'),
          ('T9', '$G9-N(R9)', ['Scope', 'Workdone Till Date'], 'Balance')]
for cell, _expr, operands, owner in checks:
    f = bk[cell].value
    want(cell[0], owner, 'backup %s holds' % cell)
    letters = re.findall(r'\$?([A-Z])9', f)
    seen = [hdr.get(l) for l in letters if l != cell[0]]
    for need in operands:
        if need not in seen:
            fail.append('%s (%s) does not reference %r — it references %s' % (cell, owner, need, seen))

print()
if fail:
    print('FAILURES (%d):' % len(fail))
    for f in fail: print('  -', f)
    sys.exit(1)
print('OK — every cross-sheet reference lands on the column it claims.')

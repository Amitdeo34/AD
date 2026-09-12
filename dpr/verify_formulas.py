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

# ---- the Excel-side importer ("2-Map and convert") ------------------------
mp = wb['2-Map and convert']
mh = {c.column_letter: c.value for c in mp[8] if c.value}
fail2 = []
calc = {'SL.', 'Variance for the Day', 'Achieved FTM till date', 'Workdone Till Date',
        '% Complete', 'Balance'}
pulled = 0
for L, head in mh.items():
    if head in calc:
        continue
    idx = mp['%s7' % L].value or ''
    if 'MATCH(%s$5' % L not in idx.replace(' ', ''):
        fail2.append('%s: row 7 does not resolve row 5 of its own column (%r)' % (head, idx))
    if "'1-Paste vendor data'!$B$5:$BI$5" not in idx:
        fail2.append('%s: row 7 does not look at the pasted header row' % head)
    d = mp['%s10' % L].value or ''
    if '%s$7' % L not in d:
        fail2.append('%s: data row ignores its own column index' % head)
    if "'1-Paste vendor data'!$B$6:$BI$1005" not in d:
        fail2.append('%s: data row does not read the pasted block' % head)
    if head != 'Name of the Structures' and '$%s10=""' % 'C' not in d:
        fail2.append('%s: data row is not gated on the structure column' % head)
    pulled += 1

mchecks = [('O10', 'Variance for the Day',   ['Plan FTD', 'Achieved FTD']),
           ('Q10', 'Achieved FTM till date', ['Achieved FTD', 'Achieved FTM till previous date']),
           ('R10', 'Workdone Till Date',     ['Achieved till last month', 'Achieved FTM till date']),
           ('S10', '% Complete',             ['Workdone Till Date', 'Scope']),
           ('T10', 'Balance',                ['Scope', 'Workdone Till Date'])]
for cell, owner, operands in mchecks:
    if mh.get(cell[0]) != owner:
        fail2.append('map %s sits under %r' % (cell, mh.get(cell[0]))); continue
    f = mp[cell].value or ''
    seen = [mh.get(l) for l in re.findall(r'\$?([A-Z])10', f) if l != cell[0]]
    for need in operands:
        if need not in seen:
            fail2.append('map %s (%s) references %s, missing %r' % (cell, owner, seen, need))

print('map sheet: %d vendor columns wired' % pulled)
if fail2:
    print('MAP FAILURES (%d):' % len(fail2))
    for f in fail2: print('  -', f)
    sys.exit(1)
print('OK — the Excel importer pulls every column from the pasted block.')

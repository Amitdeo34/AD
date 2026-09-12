"""Strict-ish structural validation of a generated .xlsx (no Excel needed)."""
import sys, zipfile, re
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def colnum(ref):
    m = re.match(r'([A-Z]+)(\d+)$', ref)
    n = 0
    for ch in m.group(1): n = n * 26 + (ord(ch) - 64)
    return n, int(m.group(2))

def check(path):
    z = zipfile.ZipFile(path)
    problems = []
    names = z.namelist()
    for req in ('[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
                'xl/_rels/workbook.xml.rels', 'xl/styles.xml'):
        if req not in names: problems.append('missing part ' + req)

    # every part must be well-formed XML
    for n in names:
        if not n.endswith('.xml') and not n.endswith('.rels'): continue
        try: ET.fromstring(z.read(n))
        except Exception as e: problems.append('XML not well formed: %s (%s)' % (n, e))

    nxf = len(ET.fromstring(z.read('xl/styles.xml')).find(NS + 'cellXfs'))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    sheets = [s.get('name') for s in wb.find(NS + 'sheets')]
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rel_targets = {r.get('Id'): r.get('Target') for r in rels}
    ct = z.read('[Content_Types].xml').decode()

    stats = []
    for i, name in enumerate(sheets, 1):
        part = 'xl/worksheets/sheet%d.xml' % i
        if part not in names:
            problems.append('sheet part missing: ' + part); continue
        if part not in ct: problems.append('sheet not declared in [Content_Types]: ' + part)
        root = ET.fromstring(z.read(part))
        data = root.find(NS + 'sheetData')
        lastrow = 0; ncells = 0; nform = 0; nstr = 0
        for row in data:
            r = int(row.get('r'))
            if r <= lastrow: problems.append('%s: rows out of order at %d' % (name, r))
            lastrow = r
            lastcol = 0
            for c in row:
                ref = c.get('r')
                if not ref: problems.append('%s: cell without r' % name); continue
                cn, rn = colnum(ref)
                if rn != r: problems.append('%s: cell %s in row %d' % (name, ref, r))
                if cn <= lastcol: problems.append('%s: cells out of order at %s' % (name, ref))
                lastcol = cn
                s = int(c.get('s') or 0)
                if s >= nxf: problems.append('%s: style index %d >= %d at %s' % (name, s, nxf, ref))
                t = c.get('t')
                if t == 'inlineStr':
                    nstr += 1
                    if c.find(NS + 'is') is None: problems.append('%s: inlineStr without <is> at %s' % (name, ref))
                elif t is not None and t not in ('n', 's', 'str', 'b'):
                    problems.append('%s: unexpected t=%s at %s' % (name, t, ref))
                if c.find(NS + 'f') is not None:
                    nform += 1
                    f = c.find(NS + 'f').text or ''
                    if f.startswith('='): problems.append('%s: formula keeps its leading = at %s' % (name, ref))
                    for tok in re.findall(r'\b([A-Z]{1,3}\d{1,7})\b', f):
                        pass
                ncells += 1
        mc = root.find(NS + 'mergeCells')
        merges = [m.get('ref') for m in mc] if mc is not None else []
        if mc is not None and int(mc.get('count')) != len(merges):
            problems.append('%s: mergeCells count mismatch' % name)
        stats.append((name, lastrow, ncells, nform, nstr, len(merges)))

    print('%-22s %6s %8s %9s %8s %7s' % ('sheet', 'rows', 'cells', 'formulas', 'strings', 'merges'))
    for s in stats: print('%-22s %6d %8d %9d %8d %7d' % s)
    print()
    if problems:
        print('PROBLEMS (%d):' % len(problems))
        for p in problems[:40]: print('  -', p)
        return 1
    print('OK — %d sheets, structurally valid' % len(stats))
    return 0

sys.exit(check(sys.argv[1]))

# -*- coding: utf-8 -*-
"""Inline SheetJS + JSZip so the consolidator runs with no internet at all.

    python3 build_offline.py
"""
import re, pathlib

SRC = pathlib.Path("dpr_consolidator.html")
OUT = pathlib.Path("DPR_Consolidator_offline.html")
LIBS = {
    "xlsx.full.min.js": pathlib.Path("vendor/xlsx.full.min.js"),
    "jszip.min.js":     pathlib.Path("vendor/jszip.min.js"),
}

html = SRC.read_text(encoding="utf-8")
for name, path in LIBS.items():
    code = path.read_text(encoding="utf-8")
    # a </script> inside a string literal in the library would close our tag early
    code = code.replace("</script>", "<\\/script>")
    pattern = re.compile(r'<script src="[^"]*' + re.escape(name) + r'"></script>')
    if not pattern.search(html):
        raise SystemExit("tag for %s not found" % name)
    html = pattern.sub(lambda m: "<script>/* %s (bundled) */\n%s\n</script>" % (name, code), html, count=1)

html = html.replace("<title>DPR Consolidator", "<title>DPR Consolidator (offline)", 1)
OUT.write_text(html, encoding="utf-8")
print("wrote", OUT, "%.1f MB" % (OUT.stat().st_size / 1e6))

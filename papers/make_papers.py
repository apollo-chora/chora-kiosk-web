#!/usr/bin/env python3
"""W20 (K158): write each prepared attempted test paper in papers.json as one A4 HTML page (render.mjs turns it into a
picture). Printed questions, the learner's answers in blue pen, the teacher's ticks, crosses, marks and notes in red.
W90 (K206): a paper with layout "essay" is a one-page essay instead: its one question, the learner's lines in blue pen
on ruled lines, each gap underlined in red with the teacher's hint in the margin (or a tick), the total and an end note.

Usage, from the repository root (the pictures and their sha256 list are committed; the HTML pages are not):
  python3 -I kiosk/world/papers/make_papers.py kiosk/world/papers/papers.json <scratch dir>
  node kiosk/world/papers/render.mjs <scratch dir>
  cp <scratch dir>/paper-*.png kiosk/world/papers/
  (cd kiosk/world/papers && shasum -a 256 paper-*.png > papers.sha256)
then python3 -B -m unittest kiosk/world/tests/test_papers.py.
"""

import html
import json
import pathlib
import sys

TICK = '<svg class="mk" viewBox="0 0 40 32"><path d="M3 18 L14 28 L37 3" /></svg>'
CROSS = '<svg class="mk" viewBox="0 0 34 34"><path d="M4 4 L30 30 M30 4 L4 30" /></svg>'
HALF = TICK

CSS = """
html, body { margin: 0; background: #fffef9; }
.page { width: 794px; height: 1123px; box-sizing: border-box; padding: 54px 70px 40px 70px; position: relative;
  font-family: 'Times New Roman', Georgia, serif; color: #1c1c1c; background: #fffef9; }
.top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1c1c1c; padding-bottom: 14px; }
.top h1 { font-size: 30px; margin: 0 0 4px 0; letter-spacing: 0.5px; }
.top .sub { font-size: 19px; }
.meta { font-size: 16px; line-height: 1.7; text-align: right; }
.meta .line { display: inline-block; min-width: 150px; border-bottom: 1px solid #555; text-align: left; padding-left: 6px; }
.total { position: absolute; right: 70px; top: 138px; width: 150px; height: 84px; }
.total .box { position: absolute; inset: 0; border: 1.5px solid #1c1c1c; font-size: 15px; padding: 6px 8px; box-sizing: border-box; }
.total .score { position: absolute; left: 0; right: 0; top: 22px; text-align: center; font: 700 34px 'Noteworthy', 'Marker Felt', cursive; color: #c62828; }
.total .ring { position: absolute; left: 20px; top: 20px; width: 108px; height: 56px; border: 2.5px solid #c62828; border-radius: 50%; transform: rotate(-8deg); }
.instr { font-size: 15px; font-style: italic; margin: 18px 0 6px 0; width: 470px; }
ol { padding: 0; margin: 58px 0 0 0; list-style: none; counter-reset: q; }
li { counter-increment: q; position: relative; padding: 0 120px 0 34px; margin-bottom: 26px; }
li::before { content: counter(q) "."; position: absolute; left: 0; top: 0; font-weight: 700; font-size: 18px; }
.q { font-size: 18px; line-height: 1.35; }
.q .marks { font-size: 15px; color: #444; white-space: nowrap; }
.ans { margin-top: 8px; border-bottom: 1px solid #9a9a9a; min-height: 34px; font: 23px 'Bradley Hand', 'Noteworthy', cursive; color: #1f3f99; line-height: 1.35; }
.note { margin-top: 6px; font: 17px 'Noteworthy', 'Marker Felt', cursive; color: #c62828; line-height: 1.3; }
.side { position: absolute; right: 0; top: 2px; width: 104px; text-align: center; }
.mk { width: 40px; height: 32px; fill: none; stroke: #c62828; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
.got { display: block; font: 700 21px 'Noteworthy', 'Marker Felt', cursive; color: #c62828; margin-top: 2px; }
.foot { position: absolute; left: 70px; right: 70px; bottom: 34px; border-top: 1px solid #888; padding-top: 6px; font-size: 13px; color: #555; display: flex; justify-content: space-between; }
"""


ESSAY_CSS = """
.eq { margin: 20px 0 0 0; width: 470px; font-size: 18px; line-height: 1.4; }
.eq .marks { font-size: 15px; color: #444; white-space: nowrap; }
.essay { margin-top: 52px; }
.ln { position: relative; padding-right: 140px; }
.ln .txt { font: 23px 'Bradley Hand', 'Noteworthy', cursive; color: #1f3f99; line-height: 38px;
  background-image: linear-gradient(to bottom, transparent 37px, #9a9a9a 37px); background-size: 100% 38px; }
.ln u { text-decoration: underline; text-decoration-color: #c62828; text-decoration-thickness: 2px; text-underline-offset: 5px;
  text-decoration-skip-ink: none; }
.ln .side { position: absolute; right: 0; top: 2px; width: 136px; text-align: center; }
.hint { font: 21px 'Noteworthy', 'Marker Felt', cursive; color: #c62828; white-space: nowrap; }
.endnote { margin-top: 22px; font: 19px 'Noteworthy', 'Marker Felt', cursive; color: #c62828; line-height: 1.35; }
"""


def essay_page(p):
    """W90 (K206): the essay layout, as round3-design.html section 5 draws it."""
    if len(p["questions"]) != 1:
        raise SystemExit("%s: an essay has one question, not %d" % (p["key"], len(p["questions"])))
    q = p["questions"][0]
    if q["marks"] != p["total"] or not 0 <= q["got"] <= q["marks"]:
        raise SystemExit("%s: %d of %d marks, the paper says %d" % (p["key"], q["got"], q["marks"], p["total"]))
    if q["got"] < q["marks"] and not q["note"]:
        raise SystemExit("%s: lost marks with no teacher's note" % p["key"])
    if q["answer"] != " ".join(ln["text"] for ln in q["lines"]):
        raise SystemExit("%s: the answer is not its lines joined by a space" % p["key"])
    if sum(1 for ln in q["lines"] if ln["margin"] == "tick") > q["got"]:
        raise SystemExit("%s: more ticks than marks" % p["key"])
    rows = []
    for ln in q["lines"]:
        u = ln.get("underline")
        if u is None:
            txt = html.escape(ln["text"])
        else:
            before, found, after = ln["text"].partition(u)
            if not found:
                raise SystemExit("%s: an underline not in its line: %r" % (p["key"], u))
            txt = "%s<u>%s</u>%s" % (html.escape(before), html.escape(u), html.escape(after))
        mark = TICK if ln["margin"] == "tick" else '<span class="hint">%s</span>' % html.escape(ln["margin"])
        rows.append('<div class="ln"><div class="txt">%s</div><div class="side">%s</div></div>' % (txt, mark))
    return """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>%(title)s: %(sub)s</title><style>%(css)s</style></head>
<body><div class="page">
<div class="top"><div><h1>%(title)s</h1><div class="sub">%(sub)s</div></div>
<div class="meta">Class: <span class="line">%(cls)s</span><br>Date: <span class="line">%(date)s</span></div></div>
<div class="total"><div class="box">Marks</div><div class="ring"></div><div class="score">%(score)d/%(total)d</div></div>
<div class="eq">%(q)s <span class="marks">[%(marks)d marks]</span></div>
<div class="essay">%(rows)s<div class="endnote">%(note)s</div></div>
<div class="foot"><span>%(title)s, %(sub)s</span><span>Page 1 of 1</span></div>
</div></body></html>
""" % {"title": html.escape(p["title"]), "sub": html.escape(p["subtitle"]), "css": CSS + ESSAY_CSS,
       "cls": html.escape(p["class"]), "date": html.escape(p["date"]), "score": q["got"], "total": p["total"],
       "q": html.escape(q["q"]), "marks": q["marks"], "rows": "".join(rows), "note": html.escape(q["note"])}


def page(p):
    if p.get("layout") == "essay":
        return essay_page(p)
    score = sum(q["got"] for q in p["questions"])
    marks = sum(q["marks"] for q in p["questions"])
    if marks != p["total"]:
        raise SystemExit("%s: the marks add up to %d, the paper says %d" % (p["key"], marks, p["total"]))
    items = []
    for q in p["questions"]:
        if not 0 <= q["got"] <= q["marks"]:
            raise SystemExit("%s: a mark of %d out of %d" % (p["key"], q["got"], q["marks"]))
        sym = TICK if q["got"] == q["marks"] else CROSS if q["got"] == 0 else HALF
        if q["got"] < q["marks"] and not q["note"]:
            raise SystemExit("%s: a lost mark with no teacher's note: %s" % (p["key"], q["q"]))
        note = '<div class="note">%s</div>' % html.escape(q["note"]) if q["note"] else ""
        items.append('<li><div class="q">%s <span class="marks">[%d mark%s]</span></div>'
                     '<div class="ans">%s</div>%s<div class="side">%s<span class="got">%d/%d</span></div></li>'
                     % (html.escape(q["q"]), q["marks"], "" if q["marks"] == 1 else "s", html.escape(q["answer"]), note, sym,
                        q["got"], q["marks"]))
    return """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>%(title)s: %(sub)s</title><style>%(css)s</style></head>
<body><div class="page">
<div class="top"><div><h1>%(title)s</h1><div class="sub">%(sub)s</div></div>
<div class="meta">Class: <span class="line">%(cls)s</span><br>Date: <span class="line">%(date)s</span></div></div>
<div class="total"><div class="box">Marks</div><div class="ring"></div><div class="score">%(score)d/%(total)d</div></div>
<div class="instr">Answer every question in the space below it. The marks for each question are shown in brackets.</div>
<ol>%(items)s</ol>
<div class="foot"><span>%(title)s, %(sub)s</span><span>Page 1 of 1</span></div>
</div></body></html>
""" % {"title": html.escape(p["title"]), "sub": html.escape(p["subtitle"]), "css": CSS, "cls": html.escape(p["class"]),
       "date": html.escape(p["date"]), "score": score, "total": p["total"], "items": "".join(items)}


def main(src, out):
    doc = json.loads(pathlib.Path(src).read_text(encoding="utf-8"))
    out = pathlib.Path(out)
    out.mkdir(parents=True, exist_ok=True)
    for p in doc["papers"]:
        f = out / (p["key"].replace(".", "-") + ".html")
        f.write_text(page(p), encoding="utf-8")
        print(f, sum(q["got"] for q in p["questions"]), "of", p["total"])


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])

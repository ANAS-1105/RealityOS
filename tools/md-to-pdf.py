#!/usr/bin/env python3
"""Render the RealityOS markdown documentation to a styled PDF.

Pure-Python (reportlab + bundled DejaVu fonts) so it runs anywhere without a
browser or system libraries. Handles the markdown subset used by the docs:
headings, paragraphs, bullet/numbered lists, tables, fenced code, blockquotes,
horizontal rules and inline code / bold / italic / links.
"""
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, HRFlowable, PageTemplate, Paragraph, Preformatted,
    Spacer, Table, TableStyle,
)

FONT_DIR = Path("/opt/freestyle/python/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf")
pdfmetrics.registerFont(TTFont("Body", str(FONT_DIR / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("Body-Bold", str(FONT_DIR / "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("Body-Italic", str(FONT_DIR / "DejaVuSans-Oblique.ttf")))
pdfmetrics.registerFont(TTFont("Mono", str(FONT_DIR / "DejaVuSansMono.ttf")))
pdfmetrics.registerFont(TTFont("Mono-Bold", str(FONT_DIR / "DejaVuSansMono-Bold.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic", boldItalic="Body-Bold")

INK = colors.HexColor("#0d1117")
BODY = colors.HexColor("#26303f")
MUTED = colors.HexColor("#5a688c")
ACCENT = colors.HexColor("#2a41b8")
LINE = colors.HexColor("#d3d7e0")
CODE_BG = colors.HexColor("#f3f4f7")
HEAD_BG = colors.HexColor("#e8ebf4")
ZEBRA = colors.HexColor("#f8f9fc")

CELL_SIZE = 7.8
CELL_CODE_SIZE = 7.2
CELL_LEAD = 10.0

S = {}
S["h1"] = ParagraphStyle("h1", fontName="Body-Bold", fontSize=21, leading=25, textColor=INK, spaceBefore=6, spaceAfter=4)
S["h2"] = ParagraphStyle("h2", fontName="Body-Bold", fontSize=14.5, leading=18, textColor=ACCENT, spaceBefore=16, spaceAfter=5)
S["h3"] = ParagraphStyle("h3", fontName="Body-Bold", fontSize=11, leading=14, textColor=INK, spaceBefore=12, spaceAfter=4)
S["body"] = ParagraphStyle("body", fontName="Body", fontSize=9.3, leading=13.4, textColor=BODY, spaceAfter=6, alignment=TA_LEFT)
S["bullet"] = ParagraphStyle("bullet", parent=S["body"], leftIndent=13, bulletIndent=3, spaceAfter=2.5)
S["num"] = ParagraphStyle("num", parent=S["body"], leftIndent=16, bulletIndent=2, spaceAfter=2.5)
S["quote"] = ParagraphStyle("quote", parent=S["body"], leftIndent=11, rightIndent=8, textColor=colors.HexColor("#3d4a6d"), fontName="Body-Italic", spaceBefore=3, spaceAfter=6)
S["code"] = ParagraphStyle("code", fontName="Mono", fontSize=7.3, leading=9.6, textColor=colors.HexColor("#16202f"))
S["cell"] = ParagraphStyle("cell", fontName="Body", fontSize=CELL_SIZE, leading=CELL_LEAD, textColor=BODY)
S["cellh"] = ParagraphStyle("cellh", fontName="Body-Bold", fontSize=CELL_SIZE, leading=CELL_LEAD, textColor=INK)

FRAME_W = 0.0


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(text: str, code_size=8) -> str:
    """Escape, then apply inline markdown with code spans protected from bold/italic."""
    tokens = []

    def stash(match):
        tokens.append('<font name="Mono" size="%g">%s</font>' % (code_size, esc(match.group(1))))
        return "\x00%d\x00" % (len(tokens) - 1)

    s = re.sub(r"`([^`]*)`", stash, text)
    s = esc(s).replace("\x00", "\x01").replace("\x01", "\x01")  # keep markers as-is
    # restore markers literally (esc does not touch \x00/\x01 digits)
    s = esc(text) if False else s
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<i>\1</i>", s)
    s = re.sub(r"\*\*?", "", s)  # stray bold markers left over
    s = re.sub(r"\x01(\d+)\x01", lambda m: tokens[int(m.group(1))], s)
    return s


def strip_md(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    return text.replace("`", "").replace("**", "").replace("*", "")


def code_block(lines):
    wrapped = []
    for line in "\n".join(lines).split("\n"):
        while len(line) > 108:
            cut = line.rfind(" ", 0, 108)
            if cut < 40:
                cut = 108
            wrapped.append(line[:cut])
            line = "    " + line[cut:].lstrip()
        wrapped.append(line)
    inner = Preformatted("\n".join(wrapped), S["code"])
    t = Table([[inner]], colWidths=[FRAME_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def token_min_widths(header, body):
    """Minimum column width so the longest unbreakable token never splits."""
    mins = []
    for i in range(len(header)):
        longest = 0
        for cell in [header[i]] + [r[i] for r in body]:
            for tok in re.split(r"\s+", strip_md(cell)):
                if tok:
                    longest = max(longest, stringWidth(tok, "Mono", CELL_CODE_SIZE))
        mins.append(longest + 11)
    return mins


def make_table(rows):
    header, body = rows[0], rows[1:]
    ncols = len(header)
    data = [[Paragraph(inline(c, CELL_CODE_SIZE), S["cellh"]) for c in header]]
    for r in body:
        r = (r + [""] * ncols)[:ncols]
        data.append([Paragraph(inline(c, CELL_CODE_SIZE), S["cell"]) for c in r])

    mins = token_min_widths(header, body)
    if sum(mins) > FRAME_W:  # pathological: fall back to proportional
        mins = [FRAME_W / ncols] * ncols
    content = [max(1, sum(len(r[i]) for r in body) + len(header[i]) * 2) for i in range(ncols)]
    extra = FRAME_W - sum(mins)
    total = sum(content)
    widths = [mins[i] + extra * content[i] / total for i in range(ncols)]

    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, colors.HexColor("#aab2c8")),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(style))
    return t


def parse(md: str):
    lines = md.split("\n")
    flow = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        if stripped == "":
            i += 1
            continue

        if stripped.startswith("```"):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            flow.append(Spacer(1, 2))
            flow.append(code_block(buf))
            flow.append(Spacer(1, 7))
            continue

        if re.match(r"^---+$", stripped) or re.match(r"^\*\*\*+$", stripped):
            flow.append(Spacer(1, 4))
            flow.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8))
            i += 1
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            level, text = len(m.group(1)), m.group(2)
            key = {1: "h1", 2: "h2", 3: "h3", 4: "h3"}[level]
            flow.append(Paragraph(inline(text), S[key]))
            if level == 2:
                flow.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#b9c2dd"), spaceBefore=1, spaceAfter=7))
            i += 1
            continue

        if stripped.startswith("|") and i + 1 < n and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                inner = lines[i].strip().strip("|")
                if not re.match(r"^[\s:|-]+$", inner):
                    rows.append([c.strip() for c in inner.split("|")])
                i += 1
            flow.append(Spacer(1, 2))
            flow.append(make_table(rows))
            flow.append(Spacer(1, 8))
            continue

        if stripped.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            flow.append(Paragraph(inline(" ".join(buf)), S["quote"]))
            continue

        m = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if m:
            flow.append(Paragraph(inline(m.group(2)), S["num"], bulletText=m.group(1) + "."))
            i += 1
            continue

        if re.match(r"^[-*]\s+", stripped):
            text = re.sub(r"^[-*]\s+", "", stripped)
            flow.append(Paragraph(inline(text), S["bullet"], bulletText="\u2022"))
            i += 1
            continue

        buf = [stripped]
        i += 1
        while i < n:
            nxt = lines[i].strip()
            if nxt == "" or nxt.startswith(("#", "|", "```", ">")) or re.match(r"^[-*]\s+", nxt) or re.match(r"^\d+\.\s+", nxt) or re.match(r"^---+$", nxt):
                break
            buf.append(nxt)
            i += 1
        flow.append(Paragraph(inline(" ".join(buf)), S["body"]))
    return flow


class Doc(BaseDocTemplate):
    def __init__(self, path, **kw):
        super().__init__(path, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                         topMargin=17 * mm, bottomMargin=16 * mm,
                         title="RealityOS - Full Project Documentation", author="RealityOS", **kw)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="f")
        self.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=self.decorate)])

    def decorate(self, canvas, doc):
        canvas.saveState()
        w, h = A4
        if doc.page > 1:
            canvas.setFont("Body", 7.3)
            canvas.setFillColor(MUTED)
            canvas.drawString(18 * mm, h - 11 * mm, "RealityOS - Full Project Documentation")
            canvas.setStrokeColor(LINE)
            canvas.setLineWidth(0.5)
            canvas.line(18 * mm, h - 13 * mm, w - 18 * mm, h - 13 * mm)
        canvas.setFont("Body", 7.3)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, "Simulate the decision before you live it.")
        canvas.drawRightString(w - 18 * mm, 10 * mm, "Page %d" % doc.page)
        canvas.setStrokeColor(LINE)
        canvas.line(18 * mm, 13 * mm, w - 18 * mm, 13 * mm)
        canvas.restoreState()


def main():
    global FRAME_W
    md = Path(sys.argv[1]).read_text(encoding="utf-8")
    out = Path(sys.argv[2])
    doc = Doc(str(out))
    FRAME_W = doc.width
    doc.build(parse(md))
    print("wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()

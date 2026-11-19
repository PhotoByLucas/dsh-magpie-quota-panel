#!/usr/bin/env python3
"""Render the README mockup for the composer dock reading.

Emits both docs/preview.png (raster, what GitHub shows) and docs/preview.svg
(vector) from one geometry list, so the two never drift. The mockup documents
the v1.3.0 meaning of the dock chip: the battery glyph and the number beside it
are the usable share of ALL account quota (Σ remaining / Σ limit), while each
row inside the panel keeps showing that account's own remaining percentage.

Usage:  python docs/build-preview.py
"""

from __future__ import annotations

import html
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
W, H = 700, 500
S = 2  # supersample factor for the raster output

FONT_REG = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"

# ---------------------------------------------------------------- palette ----
BG = "#f3f5f9"
SURFACE = "#ffffff"
BORDER = "#d5dde8"
BORDER_SOFT = "#e7edf5"
TEXT = "#202124"
SECOND = "#5f6368"
TERTIARY = "#8b8b8b"
TRACK = "#e7edf5"
ACCENT = "#4f7bd8"
GREEN = "#2f9e44"
YELLOW = "#d29922"
RED = "#d64545"
CHIP_BG = "#eef2f8"

# ------------------------------------------------------------- mock data ----
# Placeholder account labels only: this file is published, so it must never
# carry a real username, mailbox, account id or provider brand. The quota
# figures are a generic example that keeps the arithmetic readable.
ACCOUNTS = [
    ("AI account 1", "Free plan · 用户 A", "3825.81 / 4534", 3825.81, 4534, 16, RED),
    ("AI account 2", "Free plan · a***@example.com", "32.26 / 100", 32.26, 100, 68, GREEN),
    ("AI account 3", "Credits · 用户 C", "541.25 / 2600", 541.25, 2600, 79, GREEN),
    ("AI account 4", "Credits · 用户 D", "4.93 / 2100", 4.93, 2100, 100, GREEN),
]
POOL_REMAIN = sum(limit - used for _, _, _, used, limit, _, _ in ACCOUNTS)
POOL_LIMIT = sum(limit for _, _, _, _, limit, _, _ in ACCOUNTS)
POOL_PCT = POOL_REMAIN / POOL_LIMIT * 100
POOL_ROUND = round(POOL_PCT)

# ---------------------------------------------------------------- layout -----
PANEL_X, PANEL_Y, PANEL_W, PANEL_H = 44, 20, 612, 298
PAD = 18  # inner padding of the panel
HEAD_BASE = PANEL_Y + 30
ROW_TOP = PANEL_Y + 50
ROW_H = 62

COMP_X, COMP_Y, COMP_W, COMP_H = 44, 340, 612, 66
DOCK_Y = 424
CHIP_X, CHIP_W, CHIP_H = 64, 100, 26

_fonts: dict[tuple[float, bool], ImageFont.FreeTypeFont] = {}


def font(size: float, bold: bool = False):
    key = (size, bold)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)
    return _fonts[key]


def tw(text: str, size: float, bold: bool = False) -> float:
    return font(size, bold).getlength(text)


# ------------------------------------------------------------------- ops -----
ops: list[dict] = []


def rect(x, y, w, h, r=0, fill=None, stroke=None, sw=1.0):
    ops.append(dict(op="rect", x=x, y=y, w=w, h=h, r=r, fill=fill, stroke=stroke, sw=sw))


def line(x1, y1, x2, y2, color, w=1.0):
    ops.append(dict(op="line", x1=x1, y1=y1, x2=x2, y2=y2, color=color, w=w))


def circle(cx, cy, r, fill=None, stroke=None, sw=1.0):
    ops.append(dict(op="circle", cx=cx, cy=cy, r=r, fill=fill, stroke=stroke, sw=sw))


def arc(cx, cy, r, a0, a1, color, w=1.0):
    ops.append(dict(op="arc", cx=cx, cy=cy, r=r, a0=a0, a1=a1, color=color, w=w))


def text(x, y, s, size=12.0, color=TEXT, bold=False, anchor="ls"):
    ops.append(dict(op="text", x=x, y=y, s=s, size=size, color=color, bold=bold, anchor=anchor))


def battery(x, y, w, h, share, color):
    """Battery glyph: outline cells plus a fill proportional to `share`."""
    rect(x, y, w, h, 2, fill=None, stroke=color, sw=1.3)
    rect(x + w + 0.8, y + h * 0.3, 2, h * 0.4, 1, fill=color)
    if share > 0:
        rect(x + 1.7, y + 1.7, (w - 3.4) * share / 100, h - 3.4, 1, fill=color)


# --------------------------------------------------------------- drawing -----
rect(0, 0, W, H, 0, fill=BG)

# ---------------------------------------------------------------- panel ------
rect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12, fill=SURFACE, stroke=BORDER, sw=1.5)

text(PANEL_X + PAD, HEAD_BASE, "magpie 额度", 14, TEXT, bold=True)
text(PANEL_X + PANEL_W - PAD - 46, HEAD_BASE, "更新于 04:54", 11, TERTIARY, anchor="rs")
ic_x, ic_y = PANEL_X + PANEL_W - PAD - 30, HEAD_BASE - 5
arc(ic_x, ic_y, 5.2, 40, 320, TERTIARY, 1.3)
line(ic_x + 3.6, ic_y - 6.6, ic_x + 5.6, ic_y - 2.0, TERTIARY, 1.3)
cx, cy = PANEL_X + PANEL_W - PAD - 9, HEAD_BASE - 5
line(cx - 4, cy - 4, cx + 4, cy + 4, TERTIARY, 1.3)
line(cx - 4, cy + 4, cx + 4, cy - 4, TERTIARY, 1.3)

bar_x = PANEL_X + PAD
bar_w = PANEL_W - PAD * 2
for index, (name, sub, figures, used, limit, remain, tint) in enumerate(ACCOUNTS):
    top = ROW_TOP + index * ROW_H
    if index > 0:
        line(bar_x, top - 10, bar_x + bar_w, top - 10, BORDER_SOFT, 1)

    text(bar_x, top + 14, name, 13, TEXT, bold=True)
    text(bar_x + tw(name, 13, True) + 7, top + 14, sub, 10.5, TERTIARY)

    text(bar_x, top + 37, "总额度", 12, SECOND)
    text(bar_x + bar_w, top + 37, f"{remain}%", 12.5, tint, bold=True, anchor="rs")
    text(bar_x + bar_w - tw(f"{remain}%", 12.5, True) - 10, top + 37, figures, 10.5, TERTIARY, anchor="rs")

    bar_y = top + 44
    rect(bar_x, bar_y, bar_w, 4, 2, fill=TRACK)
    used_share = max(0.0, min(100.0, used / limit * 100))
    rect(bar_x, bar_y, max(2.0, bar_w * used_share / 100), 4, 2, fill=tint)

# ------------------------------------------------------------- composer ------
rect(COMP_X, COMP_Y, COMP_W, COMP_H, 16, fill=SURFACE, stroke="#c9d4e2", sw=1.5)
text(COMP_X + 24, COMP_Y + 28, "继续修复一下这个插件的读数", 12.5, "#9aa4b2")
rect(COMP_X + 24, COMP_Y + 41, 210, 7, 3.5, fill="#e9eef5")
circle(COMP_X + COMP_W - 34, COMP_Y + 32, 13, fill="#e7edf5")
line(COMP_X + COMP_W - 34, COMP_Y + 38, COMP_X + COMP_W - 34, COMP_Y + 26, "#63758c", 1.6)
line(COMP_X + COMP_W - 39, COMP_Y + 31, COMP_X + COMP_W - 34, COMP_Y + 26, "#63758c", 1.6)
line(COMP_X + COMP_W - 29, COMP_Y + 31, COMP_X + COMP_W - 34, COMP_Y + 26, "#63758c", 1.6)

# ------------------------------------------------------------- dock row ------
# The chip this release redefines: glyph + number = pooled usable share.
rect(CHIP_X, DOCK_Y, CHIP_W, CHIP_H, 6, fill=CHIP_BG)
battery(CHIP_X + 9, DOCK_Y + 8.5, 13.5, 9.5, POOL_ROUND, GREEN)
text(CHIP_X + 30, DOCK_Y + 18.5, f"{POOL_ROUND}%", 13, GREEN, bold=True)

# The shipped context meter sitting beside it, unchanged, for context.
CTX_X = CHIP_X + CHIP_W + 16
circle(CTX_X + 7, DOCK_Y + 13, 5.6, stroke="#8b8b8b", sw=1.3)
text(CTX_X + 20, DOCK_Y + 18.5, "11%", 13, "#8b8b8b")

# ---------------------------------------------------------- annotation -------
ax0, ax1 = CTX_X + 78, CTX_X + 108
line(ax0, DOCK_Y + 13, ax1, DOCK_Y + 13, ACCENT, 1.4)
line(ax1, DOCK_Y + 13, ax1 - 6, DOCK_Y + 9.5, ACCENT, 1.4)
line(ax1, DOCK_Y + 13, ax1 - 6, DOCK_Y + 16.5, ACCENT, 1.4)

text(ax1 + 8, DOCK_Y + 10, "图标与数字 = 全部账号额度的可用占比", 12, "#3b4450", bold=True)
text(ax1 + 8, DOCK_Y + 29,
     f"Σ剩余 ÷ Σ上限 = {POOL_REMAIN:,.2f} ÷ {POOL_LIMIT:,} = {POOL_PCT:.1f}% → {POOL_ROUND}%",
     10.5, SECOND)
text(ax1 + 8, DOCK_Y + 46, f"4 个账号按各自额度加权；不是最低账号（16%），也不是当前会话账号", 10.5, TERTIARY)

# ------------------------------------------------------------- rendering -----
def render_png(path: Path) -> None:
    img = Image.new("RGB", (W * S, H * S), BG)
    d = ImageDraw.Draw(img)

    def box(x, y, w, h):
        return [x * S, y * S, (x + w) * S, (y + h) * S]

    for o in ops:
        kind = o["op"]
        if kind == "rect":
            fill, stroke = o["fill"], o["stroke"]
            width = max(1, int(round(o["sw"] * S))) if stroke else 1
            if o["r"] > 0:
                d.rounded_rectangle(box(o["x"], o["y"], o["w"], o["h"]), radius=o["r"] * S,
                                    fill=fill, outline=stroke, width=width)
            else:
                d.rectangle(box(o["x"], o["y"], o["w"], o["h"]), fill=fill,
                            outline=stroke, width=width)
        elif kind == "line":
            d.line([o["x1"] * S, o["y1"] * S, o["x2"] * S, o["y2"] * S],
                   fill=o["color"], width=max(1, int(round(o["w"] * S))))
        elif kind == "circle":
            d.ellipse(box(o["cx"] - o["r"], o["cy"] - o["r"], o["r"] * 2, o["r"] * 2),
                      fill=o["fill"], outline=o["stroke"],
                      width=max(1, int(round(o["sw"] * S))) if o["stroke"] else 1)
        elif kind == "arc":
            r = o["r"]
            d.arc(box(o["cx"] - r, o["cy"] - r, r * 2, r * 2), o["a0"], o["a1"],
                  fill=o["color"], width=max(1, int(round(o["w"] * S))))
        elif kind == "text":
            anchor = {"ls": "ls", "rs": "rs", "ms": "ms"}[o["anchor"]]
            d.text((o["x"] * S, o["y"] * S), o["s"], font=font(o["size"] * S, o["bold"]),
                   fill=o["color"], anchor=anchor)

    img.resize((W, H), Image.LANCZOS).save(path, "PNG", optimize=True)
    print(f"wrote {path} ({W}x{H})")


def _arc_path(cx, cy, r, a0, a1):
    t0, t1 = math.radians(a0), math.radians(a1)
    x0, y0 = cx + r * math.cos(t0), cy + r * math.sin(t0)
    x1, y1 = cx + r * math.cos(t1), cy + r * math.sin(t1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f"M{x0:.2f},{y0:.2f} A{r:.2f},{r:.2f} 0 {large} 1 {x1:.2f},{y1:.2f}"


def render_svg(path: Path) -> None:
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"',
        '     font-family="Microsoft YaHei, PingFang SC, Noto Sans SC, Segoe UI, sans-serif">',
    ]
    for o in ops:
        kind = o["op"]
        if kind == "rect":
            attrs = [f'x="{o["x"]}"', f'y="{o["y"]}"', f'width="{o["w"]}"', f'height="{o["h"]}"']
            if o["r"] > 0:
                attrs.append(f'rx="{o["r"]}"')
            attrs.append(f'fill="{o["fill"] or "none"}"')
            if o["stroke"]:
                attrs += [f'stroke="{o["stroke"]}"', f'stroke-width="{o["sw"]}"']
            out.append(f'  <rect {" ".join(attrs)}/>')
        elif kind == "line":
            out.append(f'  <line x1="{o["x1"]}" y1="{o["y1"]}" x2="{o["x2"]}" y2="{o["y2"]}" '
                       f'stroke="{o["color"]}" stroke-width="{o["w"]}" stroke-linecap="round"/>')
        elif kind == "circle":
            attrs = [f'cx="{o["cx"]}"', f'cy="{o["cy"]}"', f'r="{o["r"]}"',
                     f'fill="{o["fill"] or "none"}"']
            if o["stroke"]:
                attrs += [f'stroke="{o["stroke"]}"', f'stroke-width="{o["sw"]}"']
            out.append(f'  <circle {" ".join(attrs)}/>')
        elif kind == "arc":
            out.append(f'  <path d="{_arc_path(o["cx"], o["cy"], o["r"], o["a0"], o["a1"])}" '
                       f'fill="none" stroke="{o["color"]}" stroke-width="{o["w"]}" stroke-linecap="round"/>')
        elif kind == "text":
            anchor = {"ls": "start", "rs": "end", "ms": "middle"}[o["anchor"]]
            weight = ' font-weight="600"' if o["bold"] else ""
            out.append(f'  <text x="{o["x"]}" y="{o["y"]}" font-size="{o["size"]}" '
                       f'fill="{o["color"]}" text-anchor="{anchor}"{weight}>{html.escape(o["s"])}</text>')
    out.append("</svg>")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    print(f"pool: {POOL_REMAIN:.2f} / {POOL_LIMIT} = {POOL_PCT:.2f}% -> {POOL_ROUND}%")
    render_png(HERE / "preview.png")
    render_svg(HERE / "preview.svg")

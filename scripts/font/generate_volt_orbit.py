#!/usr/bin/env python3
"""Build VOLT Orbit Display, the fleet's original Latin display face.

V3 replaces the early seven-segment experiment with a restrained navigational
display face: wide counters, clipped terminals and a clear reading rhythm at
both hero and cockpit-metric sizes. Korean is intentionally delegated to the
site's Korean text stack; this file only owns the Latin identity layer.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

extra_packages = os.environ.get("VOLT_FONTTOOLS_PATH")
if extra_packages:
    sys.path.insert(0, extra_packages)

try:
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import TTFont
except ModuleNotFoundError as error:
    raise SystemExit(
        "fonttools is required. Install it outside the production dependency tree "
        "or set VOLT_FONTTOOLS_PATH."
    ) from error


FAMILY_NAME = "VOLT Orbit Display"
COPYRIGHT = "Copyright 2026 VOLT Fleet. All rights reserved."
VERSION = "Version 3.000"
UNITS_PER_EM = 1000
ASCENDER = 810
DESCENDER = -210
CAP_HEIGHT = 720
X_HEIGHT = 520
DEFAULT_ADVANCE = 590
NARROW_ADVANCE = 350
WIDE_ADVANCE = 710
SPACE_ADVANCE = 250
PUNCTUATION_ADVANCE = 270
LEFT = 70
CENTER = 295
RIGHT = 520
TOP = CAP_HEIGHT
MIDDLE = 360
BASELINE = 0
STROKE = 84
TERMINAL_CUT = 28


def beam(
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    width: int = STROKE,
    cut: int = TERMINAL_CUT,
) -> tuple:
    return ("beam", x1, y1, x2, y2, width, cut)


def dot(center_x: int, center_y: int, radius: int) -> tuple:
    return ("dot", center_x, center_y, radius)


def compose(*parts: tuple) -> list[tuple]:
    return list(parts)


def horizontal(
    y: int,
    start: int = LEFT,
    end: int = RIGHT,
    width: int = STROKE,
    cut: int = TERMINAL_CUT,
) -> tuple:
    return beam(start, y, end, y, width, cut)


def vertical(
    x: int,
    start: int = BASELINE,
    end: int = TOP,
    width: int = STROKE,
    cut: int = TERMINAL_CUT,
) -> tuple:
    return beam(x, start, x, end, width, cut)


def octagon_parts() -> list[tuple]:
    corner = 92
    return compose(
        horizontal(TOP, LEFT + corner, RIGHT - corner),
        beam(RIGHT - corner, TOP, RIGHT, TOP - corner),
        vertical(RIGHT, BASELINE + corner, TOP - corner),
        beam(RIGHT, BASELINE + corner, RIGHT - corner, BASELINE),
        horizontal(BASELINE, LEFT + corner, RIGHT - corner),
        beam(LEFT + corner, BASELINE, LEFT, BASELINE + corner),
        vertical(LEFT, BASELINE + corner, TOP - corner),
        beam(LEFT, TOP - corner, LEFT + corner, TOP),
    )


def rounded_bowl(top: int, bottom: int) -> list[tuple]:
    right_x = RIGHT
    shoulder = 82
    return compose(
        horizontal(top, LEFT, right_x - shoulder),
        beam(right_x - shoulder, top, right_x, top - shoulder),
        vertical(right_x, bottom + shoulder, top - shoulder),
        beam(right_x, bottom + shoulder, right_x - shoulder, bottom),
        horizontal(bottom, LEFT, right_x - shoulder),
    )


def special_parts() -> dict[str, list[tuple]]:
    return {
        " ": [],
        ".": [dot(CENTER, 52, 35)],
        ",": [dot(CENTER, 62, 33), beam(CENTER + 10, 32, CENTER - 42, -96, 48, 14)],
        ":": [dot(CENTER, 520, 31), dot(CENTER, 58, 31)],
        ";": [dot(CENTER, 520, 31), dot(CENTER, 62, 31), beam(CENTER + 8, 35, CENTER - 42, -92, 46, 12)],
        "-": [horizontal(MIDDLE, LEFT + 70, RIGHT - 70)],
        "_": [horizontal(-72)],
        "/": [beam(LEFT + 24, BASELINE, RIGHT - 24, TOP, 62, 20)],
        "\\": [beam(LEFT + 24, TOP, RIGHT - 24, BASELINE, 62, 20)],
        "+": [horizontal(MIDDLE, LEFT + 60, RIGHT - 60), vertical(CENTER, 150, 570)],
        "=": [horizontal(500, LEFT + 56, RIGHT - 56), horizontal(220, LEFT + 56, RIGHT - 56)],
        "!": [vertical(CENTER, 170, TOP), dot(CENTER, 52, 32)],
        "?": compose(
            horizontal(TOP, LEFT + 42, RIGHT - 82),
            beam(RIGHT - 82, TOP, RIGHT, TOP - 88),
            beam(RIGHT, TOP - 88, CENTER, MIDDLE),
            vertical(CENTER, 220, MIDDLE),
            dot(CENTER, 52, 32),
        ),
        "%": [
            dot(LEFT + 94, TOP - 96, 48),
            dot(RIGHT - 94, 98, 48),
            beam(LEFT + 36, BASELINE + 16, RIGHT - 36, TOP - 16, 54, 18),
        ],
        "&": compose(
            beam(LEFT + 44, TOP - 82, CENTER, TOP),
            beam(LEFT, TOP - 178, LEFT + 44, TOP - 82),
            beam(LEFT, TOP - 178, LEFT + 130, MIDDLE),
            beam(LEFT + 130, MIDDLE, LEFT, BASELINE + 158),
            beam(LEFT, BASELINE + 158, LEFT + 96, BASELINE),
            beam(LEFT + 96, BASELINE, RIGHT - 30, BASELINE),
            beam(CENTER - 20, MIDDLE + 36, RIGHT, BASELINE),
            beam(CENTER + 66, MIDDLE + 158, RIGHT, TOP - 24),
        ),
        "@": compose(*octagon_parts(), horizontal(MIDDLE, CENTER, RIGHT - 78), vertical(CENTER, 142, MIDDLE)),
        "#": [
            vertical(LEFT + 118, -20, TOP + 20, 48, 14),
            vertical(RIGHT - 118, -20, TOP + 20, 48, 14),
            horizontal(502, LEFT, RIGHT, 48, 14),
            horizontal(220, LEFT, RIGHT, 48, 14),
        ],
        "$": compose(
            horizontal(TOP - 18, LEFT + 70, RIGHT - 48),
            beam(LEFT + 70, TOP - 18, LEFT, MIDDLE + 74),
            horizontal(MIDDLE, LEFT + 28, RIGHT - 28),
            beam(RIGHT - 28, MIDDLE, RIGHT, BASELINE + 78),
            horizontal(BASELINE + 18, LEFT + 52, RIGHT - 68),
            vertical(CENTER, -82, TOP + 82, 46, 14),
        ),
        "*": [
            beam(LEFT + 84, 190, RIGHT - 84, TOP - 190, 48, 14),
            beam(LEFT + 84, TOP - 190, RIGHT - 84, 190, 48, 14),
            vertical(CENTER, 112, TOP - 112, 48, 14),
        ],
        "'": [beam(CENTER + 12, TOP, CENTER - 42, TOP - 166, 46, 14)],
        '"': [
            beam(CENTER - 84, TOP, CENTER - 132, TOP - 166, 46, 14),
            beam(CENTER + 88, TOP, CENTER + 40, TOP - 166, 46, 14),
        ],
        "(": [beam(RIGHT - 82, TOP, LEFT + 102, MIDDLE, 56, 18), beam(LEFT + 102, MIDDLE, RIGHT - 82, BASELINE, 56, 18)],
        ")": [beam(LEFT + 82, TOP, RIGHT - 102, MIDDLE, 56, 18), beam(RIGHT - 102, MIDDLE, LEFT + 82, BASELINE, 56, 18)],
        "[": [vertical(LEFT + 68), horizontal(TOP, LEFT + 68, RIGHT - 118), horizontal(BASELINE, LEFT + 68, RIGHT - 118)],
        "]": [vertical(RIGHT - 68), horizontal(TOP, LEFT + 118, RIGHT - 68), horizontal(BASELINE, LEFT + 118, RIGHT - 68)],
        "<": [beam(RIGHT - 18, TOP - 42, LEFT + 32, MIDDLE, 58, 18), beam(LEFT + 32, MIDDLE, RIGHT - 18, BASELINE + 42, 58, 18)],
        ">": [beam(LEFT + 18, TOP - 42, RIGHT - 32, MIDDLE, 58, 18), beam(RIGHT - 32, MIDDLE, LEFT + 18, BASELINE + 42, 58, 18)],
        "|": [vertical(CENTER, -80, TOP + 80, 48, 14)],
        "^": [beam(LEFT + 64, TOP - 250, CENTER, TOP, 48, 14), beam(CENTER, TOP, RIGHT - 64, TOP - 250, 48, 14)],
        "~": [beam(LEFT + 20, MIDDLE, CENTER - 20, MIDDLE + 86, 42, 12), beam(CENTER - 20, MIDDLE + 86, RIGHT - 20, MIDDLE, 42, 12)],
        "`": [beam(CENTER - 18, TOP, CENTER + 34, TOP - 166, 46, 14)],
    }


LETTER_PARTS = {
    "A": compose(beam(LEFT, BASELINE, CENTER, TOP), beam(CENTER, TOP, RIGHT, BASELINE), horizontal(MIDDLE - 8, LEFT + 115, RIGHT - 115)),
    "B": compose(vertical(LEFT), *rounded_bowl(TOP, MIDDLE), *rounded_bowl(MIDDLE, BASELINE)),
    "C": compose(horizontal(TOP, LEFT + 86, RIGHT), beam(LEFT + 86, TOP, LEFT, TOP - 86), vertical(LEFT, BASELINE + 86, TOP - 86), beam(LEFT, BASELINE + 86, LEFT + 86, BASELINE), horizontal(BASELINE, LEFT + 86, RIGHT)),
    "D": compose(vertical(LEFT), *rounded_bowl(TOP, BASELINE)),
    "E": compose(vertical(LEFT), horizontal(TOP), horizontal(MIDDLE, LEFT, RIGHT - 72), horizontal(BASELINE)),
    "F": compose(vertical(LEFT), horizontal(TOP), horizontal(MIDDLE, LEFT, RIGHT - 72)),
    "G": compose(horizontal(TOP, LEFT + 86, RIGHT), beam(LEFT + 86, TOP, LEFT, TOP - 86), vertical(LEFT, BASELINE + 86, TOP - 86), beam(LEFT, BASELINE + 86, LEFT + 86, BASELINE), horizontal(BASELINE, LEFT + 86, RIGHT), horizontal(MIDDLE, CENTER, RIGHT), vertical(RIGHT, BASELINE + 58, MIDDLE)),
    "H": compose(vertical(LEFT), vertical(RIGHT), horizontal(MIDDLE)),
    "I": compose(horizontal(TOP, LEFT + 70, RIGHT - 70), vertical(CENTER), horizontal(BASELINE, LEFT + 70, RIGHT - 70)),
    "J": compose(horizontal(TOP, LEFT + 150, RIGHT), vertical(RIGHT, BASELINE + 126, TOP), beam(RIGHT, BASELINE + 126, RIGHT - 88, BASELINE), horizontal(BASELINE, LEFT + 100, RIGHT - 88), beam(LEFT + 100, BASELINE, LEFT, BASELINE + 96)),
    "K": compose(vertical(LEFT), beam(LEFT + 18, MIDDLE, RIGHT, TOP), beam(LEFT + 18, MIDDLE, RIGHT, BASELINE)),
    "L": compose(vertical(LEFT), horizontal(BASELINE)),
    "M": compose(vertical(LEFT), vertical(RIGHT + 150), beam(LEFT, TOP, CENTER + 75, MIDDLE - 32), beam(RIGHT + 150, TOP, CENTER + 75, MIDDLE - 32)),
    "N": compose(vertical(LEFT), vertical(RIGHT), beam(LEFT, TOP, RIGHT, BASELINE)),
    "O": compose(*octagon_parts()),
    "P": compose(vertical(LEFT), *rounded_bowl(TOP, MIDDLE)),
    "Q": compose(*octagon_parts(), beam(CENTER + 60, MIDDLE - 40, RIGHT + 62, BASELINE - 54)),
    "R": compose(vertical(LEFT), *rounded_bowl(TOP, MIDDLE), beam(CENTER - 16, MIDDLE, RIGHT, BASELINE)),
    "S": compose(horizontal(TOP, LEFT + 62, RIGHT - 18), beam(LEFT + 62, TOP, LEFT, MIDDLE + 76), horizontal(MIDDLE, LEFT + 16, RIGHT - 20), beam(RIGHT - 20, MIDDLE, RIGHT, BASELINE + 78), horizontal(BASELINE, LEFT + 22, RIGHT - 62)),
    "T": compose(horizontal(TOP), vertical(CENTER)),
    "U": compose(vertical(LEFT, BASELINE + 108, TOP), vertical(RIGHT, BASELINE + 108, TOP), beam(LEFT, BASELINE + 108, CENTER, BASELINE), beam(CENTER, BASELINE, RIGHT, BASELINE + 108)),
    "V": compose(beam(LEFT, TOP, CENTER, BASELINE), beam(CENTER, BASELINE, RIGHT, TOP)),
    "W": compose(beam(LEFT, TOP, LEFT + 150, BASELINE), beam(LEFT + 150, BASELINE, CENTER + 30, MIDDLE - 10), beam(CENTER + 30, MIDDLE - 10, RIGHT, BASELINE), beam(RIGHT, BASELINE, RIGHT + 150, TOP)),
    "X": compose(beam(LEFT, TOP, RIGHT, BASELINE), beam(LEFT, BASELINE, RIGHT, TOP)),
    "Y": compose(beam(LEFT, TOP, CENTER, MIDDLE), beam(RIGHT, TOP, CENTER, MIDDLE), vertical(CENTER, BASELINE, MIDDLE)),
    "Z": compose(horizontal(TOP), beam(RIGHT, TOP, LEFT, BASELINE), horizontal(BASELINE)),
}


DIGIT_PARTS = {
    "0": compose(*octagon_parts(), beam(LEFT + 106, BASELINE + 90, RIGHT - 106, TOP - 90, 46, 14)),
    "1": compose(beam(LEFT + 80, TOP - 104, CENTER, TOP), vertical(CENTER), horizontal(BASELINE, LEFT + 74, RIGHT - 42)),
    "2": compose(horizontal(TOP, LEFT + 58, RIGHT - 74), beam(RIGHT - 74, TOP, RIGHT, TOP - 84), beam(RIGHT, TOP - 84, LEFT, BASELINE), horizontal(BASELINE)),
    "3": compose(horizontal(TOP, LEFT + 44, RIGHT - 72), beam(RIGHT - 72, TOP, RIGHT, TOP - 88), vertical(RIGHT, BASELINE + 82, TOP - 88), beam(RIGHT, BASELINE + 82, RIGHT - 72, BASELINE), horizontal(MIDDLE, LEFT + 122, RIGHT - 10), horizontal(BASELINE, LEFT + 44, RIGHT - 72)),
    "4": compose(beam(LEFT, TOP, LEFT, MIDDLE), beam(LEFT, MIDDLE, RIGHT, MIDDLE), vertical(RIGHT)),
    "5": compose(horizontal(TOP), vertical(LEFT, MIDDLE, TOP), horizontal(MIDDLE), vertical(RIGHT, BASELINE + 76, MIDDLE), beam(RIGHT, BASELINE + 76, RIGHT - 72, BASELINE), horizontal(BASELINE, LEFT + 38, RIGHT - 72)),
    "6": compose(horizontal(TOP, LEFT + 62, RIGHT - 34), beam(LEFT + 62, TOP, LEFT, MIDDLE + 74), vertical(LEFT, BASELINE + 76, MIDDLE + 74), horizontal(MIDDLE), vertical(RIGHT, BASELINE + 76, MIDDLE), beam(RIGHT, BASELINE + 76, RIGHT - 72, BASELINE), horizontal(BASELINE, LEFT + 42, RIGHT - 72)),
    "7": compose(horizontal(TOP), beam(RIGHT, TOP, CENTER, BASELINE)),
    "8": compose(*octagon_parts(), horizontal(MIDDLE)),
    "9": compose(horizontal(TOP, LEFT + 62, RIGHT - 34), beam(LEFT + 62, TOP, LEFT, TOP - 74), vertical(LEFT, MIDDLE, TOP - 74), horizontal(MIDDLE), vertical(RIGHT, BASELINE + 76, MIDDLE), beam(RIGHT, BASELINE + 76, RIGHT - 72, BASELINE), horizontal(BASELINE, LEFT + 42, RIGHT - 72)),
}


def add_polygon(pen: TTGlyphPen, points: list[tuple[float, float]]) -> None:
    pen.moveTo(points[0])
    for point in points[1:]:
        pen.lineTo(point)
    pen.closePath()


def add_beam(pen: TTGlyphPen, values: tuple) -> None:
    _, x1, y1, x2, y2, width, cut = values
    distance = math.hypot(x2 - x1, y2 - y1)
    if distance == 0:
        raise ValueError("VOLT Orbit cannot build a zero-length beam.")
    terminal = min(cut, distance / 4, width / 2)
    half = width / 2
    unit_x = (x2 - x1) / distance
    unit_y = (y2 - y1) / distance
    normal_x = -unit_y
    normal_y = unit_x
    local_points = [
        (terminal, half),
        (distance - terminal, half),
        (distance, half - terminal),
        (distance, -half + terminal),
        (distance - terminal, -half),
        (terminal, -half),
        (0, -half + terminal),
        (0, half - terminal),
    ]
    points = [
        (x1 + unit_x * along + normal_x * across, y1 + unit_y * along + normal_y * across)
        for along, across in local_points
    ]
    add_polygon(pen, points)


def add_dot(pen: TTGlyphPen, values: tuple) -> None:
    _, center_x, center_y, radius = values
    cut = radius * 0.42
    add_polygon(
        pen,
        [
            (center_x - radius + cut, center_y + radius),
            (center_x + radius - cut, center_y + radius),
            (center_x + radius, center_y + radius - cut),
            (center_x + radius, center_y - radius + cut),
            (center_x + radius - cut, center_y - radius),
            (center_x - radius + cut, center_y - radius),
            (center_x - radius, center_y - radius + cut),
            (center_x - radius, center_y + radius - cut),
        ],
    )


def glyph_from_parts(parts: list[tuple]):
    pen = TTGlyphPen(None)
    for part in parts:
        if part[0] == "beam":
            add_beam(pen, part)
        elif part[0] == "dot":
            add_dot(pen, part)
        else:
            raise ValueError(f"Unsupported VOLT Orbit part: {part[0]}")
    return pen.glyph()


def char_parts(character: str, punctuation: dict[str, list[tuple]]) -> list[tuple]:
    upper_character = character.upper()
    if upper_character in LETTER_PARTS:
        return LETTER_PARTS[upper_character]
    if character in DIGIT_PARTS:
        return DIGIT_PARTS[character]
    return punctuation.get(character, [])


def glyph_name(character: str) -> str:
    return "space" if character == " " else f"uni{ord(character):04X}"


def advance_width(character: str) -> int:
    upper_character = character.upper()
    if character == " ":
        return SPACE_ADVANCE
    if character in ".,;:'\"!|`":
        return PUNCTUATION_ADVANCE
    if upper_character in {"I", "J"} or character == "1":
        return NARROW_ADVANCE
    if upper_character in {"M", "W"}:
        return WIDE_ADVANCE
    return DEFAULT_ADVANCE


def supported_characters(punctuation: dict[str, list[tuple]]) -> list[str]:
    letters = list("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
    digits = list("0123456789")
    return [*letters, *digits, *punctuation.keys()]


def build_glyphs(characters: list[str], punctuation: dict[str, list[tuple]]) -> tuple[list[str], dict, dict, dict]:
    glyph_order = [".notdef", ".null", "nonmarkingreturn"]
    glyphs = {
        ".notdef": glyph_from_parts(octagon_parts()),
        ".null": glyph_from_parts([]),
        "nonmarkingreturn": glyph_from_parts([]),
    }
    metrics = {
        ".notdef": (DEFAULT_ADVANCE, 0),
        ".null": (0, 0),
        "nonmarkingreturn": (0, 0),
    }
    cmap = {}
    for character in characters:
        name = glyph_name(character)
        glyph_order.append(name)
        glyphs[name] = glyph_from_parts(char_parts(character, punctuation))
        metrics[name] = (advance_width(character), 0)
        cmap[ord(character)] = name
    return glyph_order, glyphs, metrics, cmap


def build_font(output_dir: Path) -> tuple[Path, Path]:
    punctuation = special_parts()
    characters = supported_characters(punctuation)
    glyph_order, glyphs, metrics, cmap = build_glyphs(characters, punctuation)
    builder = FontBuilder(UNITS_PER_EM, isTTF=True)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap(cmap)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    builder.setupNameTable(
        {
            "copyright": COPYRIGHT,
            "familyName": FAMILY_NAME,
            "styleName": "Regular",
            "fullName": FAMILY_NAME,
            "uniqueFontIdentifier": f"{FAMILY_NAME}; {VERSION}",
            "psName": "VOLTOrbitDisplay-Regular",
            "version": VERSION,
        }
    )
    builder.setupOS2(
        sTypoAscender=ASCENDER,
        sTypoDescender=DESCENDER,
        sTypoLineGap=0,
        usWinAscent=ASCENDER,
        usWinDescent=abs(DESCENDER),
        sxHeight=X_HEIGHT,
        sCapHeight=CAP_HEIGHT,
        usWeightClass=700,
    )
    builder.setupPost()
    builder.setupMaxp()
    output_dir.mkdir(parents=True, exist_ok=True)
    ttf_path = output_dir / "VOLT-Orbit-Display.ttf"
    woff2_path = output_dir / "VOLT-Orbit-Display.woff2"
    builder.save(ttf_path)
    font = TTFont(ttf_path)
    font.flavor = "woff2"
    font.save(woff2_path)
    return ttf_path, woff2_path


def verify_font(path: Path, characters: list[str]) -> None:
    font = TTFont(path)
    cmap = font.getBestCmap()
    missing = [character for character in characters if ord(character) not in cmap]
    if missing:
        raise RuntimeError(f"Missing VOLT Orbit glyphs: {''.join(missing)}")
    if path.stat().st_size > 100_000:
        raise RuntimeError(f"VOLT Orbit webfont exceeds 100KB: {path.stat().st_size} bytes")
    if font["OS/2"].sCapHeight != CAP_HEIGHT:
        raise RuntimeError("VOLT Orbit cap height metadata is out of sync.")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the VOLT Orbit Display webfont.")
    parser.add_argument("--output", default="assets/fonts", help="Output directory relative to the project root.")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    root = Path(__file__).resolve().parents[2]
    output_dir = (root / arguments.output).resolve()
    punctuation = special_parts()
    characters = supported_characters(punctuation)
    ttf_path, woff2_path = build_font(output_dir)
    verify_font(ttf_path, characters)
    verify_font(woff2_path, characters)
    print(f"Built {ttf_path.relative_to(root)} and {woff2_path.relative_to(root)}")


if __name__ == "__main__":
    main()

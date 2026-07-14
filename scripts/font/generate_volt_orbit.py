#!/usr/bin/env python3
"""Build the original VOLT Orbit Display Latin webfont.

The font intentionally covers Latin UI/display text, numerals and common ASCII
punctuation. Korean copy falls back to the site's Korean text family.
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
COPYRIGHT = "Copyright 2026 VOLT Fleet."
UNITS_PER_EM = 1000
ASCENDER = 800
DESCENDER = -200
ADVANCE = 570
SPACE_ADVANCE = 220
PUNCTUATION_ADVANCE = 300
LEFT = 66
CENTER = 285
RIGHT = 504
TOP = 760
MIDDLE = 380
BASELINE = 0
STROKE = 82


def beam(x1: int, y1: int, x2: int, y2: int, width: int = STROKE) -> tuple:
    return ("beam", x1, y1, x2, y2, width)


SEGMENTS = {
    "top": beam(LEFT, TOP, RIGHT, TOP),
    "middle": beam(LEFT, MIDDLE, RIGHT, MIDDLE),
    "bottom": beam(LEFT, BASELINE, RIGHT, BASELINE),
    "left": beam(LEFT, BASELINE, LEFT, TOP),
    "right": beam(RIGHT, BASELINE, RIGHT, TOP),
    "upper_left": beam(LEFT, MIDDLE, LEFT, TOP),
    "upper_right": beam(RIGHT, MIDDLE, RIGHT, TOP),
    "lower_left": beam(LEFT, BASELINE, LEFT, MIDDLE),
    "lower_right": beam(RIGHT, BASELINE, RIGHT, MIDDLE),
    "center": beam(CENTER, BASELINE, CENTER, TOP),
    "diag_up_left": beam(LEFT, BASELINE, CENTER, TOP),
    "diag_up_right": beam(CENTER, TOP, RIGHT, BASELINE),
    "diag_down_left": beam(LEFT, TOP, CENTER, BASELINE),
    "diag_down_right": beam(RIGHT, TOP, CENTER, BASELINE),
    "n_diag": beam(LEFT, TOP, RIGHT, BASELINE),
    "k_top": beam(LEFT, MIDDLE, RIGHT, TOP),
    "k_bottom": beam(LEFT, MIDDLE, RIGHT, BASELINE),
    "m_left": beam(LEFT, TOP, CENTER - 85, MIDDLE),
    "m_right": beam(CENTER - 85, MIDDLE, RIGHT, TOP),
    "d_top": beam(LEFT, TOP, RIGHT - 86, TOP),
    "d_upper": beam(RIGHT - 86, TOP, RIGHT, TOP - 86),
    "d_right": beam(RIGHT, TOP - 86, RIGHT, BASELINE + 86),
    "d_lower": beam(RIGHT, BASELINE + 86, RIGHT - 86, BASELINE),
    "d_bottom": beam(RIGHT - 86, BASELINE, LEFT, BASELINE),
    "j_top": beam(LEFT + 150, TOP, RIGHT, TOP),
    "j_bottom": beam(LEFT + 132, BASELINE, RIGHT, BASELINE),
    "j_left": beam(LEFT + 132, BASELINE, LEFT + 132, MIDDLE - 70),
    "short_vertical": beam(CENTER, MIDDLE - 10, CENTER, BASELINE + 120),
}


LETTER_SEGMENTS = {
    "A": ("diag_up_left", "diag_up_right", "middle"),
    "B": ("left", "top", "middle", "bottom", "upper_right", "lower_right"),
    "C": ("top", "upper_left", "lower_left", "bottom"),
    "D": ("left", "d_top", "d_upper", "d_right", "d_lower", "d_bottom"),
    "E": ("left", "top", "middle", "bottom"),
    "F": ("left", "top", "middle"),
    "G": ("top", "upper_left", "lower_left", "bottom", "middle", "lower_right"),
    "H": ("left", "right", "middle"),
    "I": ("top", "center", "bottom"),
    "J": ("j_top", "right", "j_bottom", "j_left"),
    "K": ("left", "k_top", "k_bottom"),
    "L": ("left", "bottom"),
    "M": ("left", "right", "m_left", "m_right"),
    "N": ("left", "right", "n_diag"),
    "O": ("top", "right", "bottom", "left"),
    "P": ("left", "top", "middle", "upper_right"),
    "Q": ("top", "right", "bottom", "left", "k_bottom"),
    "R": ("left", "top", "middle", "upper_right", "k_bottom"),
    "S": ("top", "upper_left", "middle", "lower_right", "bottom"),
    "T": ("top", "center"),
    "U": ("left", "right", "bottom"),
    "V": ("diag_down_left", "diag_down_right"),
    "W": ("diag_down_left", "m_left", "m_right", "diag_down_right"),
    "X": ("diag_down_left", "diag_down_right"),
    "Y": ("diag_down_left", "diag_down_right", "short_vertical"),
    "Z": ("top", "n_diag", "bottom"),
}


DIGIT_SEGMENTS = {
    "0": ("top", "right", "bottom", "left"),
    "1": ("center", "bottom"),
    "2": ("top", "upper_right", "middle", "lower_left", "bottom"),
    "3": ("top", "upper_right", "middle", "lower_right", "bottom"),
    "4": ("upper_left", "upper_right", "middle", "lower_right"),
    "5": ("top", "upper_left", "middle", "lower_right", "bottom"),
    "6": ("top", "upper_left", "middle", "lower_left", "lower_right", "bottom"),
    "7": ("top", "upper_right", "lower_right"),
    "8": ("top", "right", "bottom", "left", "middle"),
    "9": ("top", "upper_left", "upper_right", "middle", "lower_right", "bottom"),
}


def compose(*names: str) -> list[tuple]:
    return [SEGMENTS[name] for name in names]


def special_parts() -> dict[str, list[tuple]]:
    return {
        " ": [],
        ".": [("dot", CENTER, 50, 42, 42)],
        ",": [("dot", CENTER, 58, 42, 42), beam(CENTER, 25, CENTER - 62, -105, 58)],
        ":": [("dot", CENTER, 535, 37, 37), ("dot", CENTER, 60, 37, 37)],
        ";": [("dot", CENTER, 535, 37, 37), ("dot", CENTER, 58, 37, 37), beam(CENTER, 30, CENTER - 52, -95, 52)],
        "-": compose("middle"),
        "_": [beam(LEFT, -82, RIGHT, -82)],
        "/": [beam(LEFT, BASELINE, RIGHT, TOP)],
        "\\": [beam(LEFT, TOP, RIGHT, BASELINE)],
        "+": [beam(LEFT, MIDDLE, RIGHT, MIDDLE), beam(CENTER, 150, CENTER, 610)],
        "=": [beam(LEFT, 515, RIGHT, 515), beam(LEFT, 245, RIGHT, 245)],
        "!": [beam(CENTER, 175, CENTER, TOP), ("dot", CENTER, 50, 38, 38)],
        "?": compose("top", "upper_right", "middle") + [beam(CENTER, MIDDLE, CENTER, 205), ("dot", CENTER, 50, 38, 38)],
        "%": [("dot", LEFT + 74, TOP - 92, 57, 57), ("dot", RIGHT - 74, 94, 57, 57), beam(LEFT + 30, 0, RIGHT - 30, TOP, 58)],
        "&": compose("upper_left", "top", "middle", "lower_left", "lower_right", "bottom") + [beam(LEFT + 55, MIDDLE, RIGHT, 0, 58)],
        "@": compose("top", "right", "bottom", "left", "middle") + [beam(CENTER, MIDDLE, RIGHT, MIDDLE), beam(CENTER, MIDDLE, CENTER, 100)],
        "#": [beam(LEFT + 110, 0, LEFT + 110, TOP, 54), beam(RIGHT - 110, 0, RIGHT - 110, TOP, 54), beam(LEFT, 515, RIGHT, 515, 54), beam(LEFT, 245, RIGHT, 245, 54)],
        "$": compose("top", "upper_left", "middle", "lower_right", "bottom") + [beam(CENTER, -90, CENTER, TOP + 90, 52)],
        "*": [beam(LEFT + 50, 145, RIGHT - 50, TOP - 145, 54), beam(LEFT + 50, TOP - 145, RIGHT - 50, 145, 54), beam(CENTER, 80, CENTER, TOP - 80, 54)],
        "'": [beam(CENTER, TOP, CENTER - 52, TOP - 160, 52)],
        '"': [beam(CENTER - 102, TOP, CENTER - 152, TOP - 160, 52), beam(CENTER + 102, TOP, CENTER + 52, TOP - 160, 52)],
        "(": [beam(RIGHT - 80, TOP, LEFT + 116, MIDDLE, 58), beam(LEFT + 116, MIDDLE, RIGHT - 80, BASELINE, 58)],
        ")": [beam(LEFT + 80, TOP, RIGHT - 116, MIDDLE, 58), beam(RIGHT - 116, MIDDLE, LEFT + 80, BASELINE, 58)],
        "[": [beam(LEFT + 65, BASELINE, LEFT + 65, TOP), beam(LEFT + 65, TOP, RIGHT - 120, TOP), beam(LEFT + 65, BASELINE, RIGHT - 120, BASELINE)],
        "]": [beam(RIGHT - 65, BASELINE, RIGHT - 65, TOP), beam(LEFT + 120, TOP, RIGHT - 65, TOP), beam(LEFT + 120, BASELINE, RIGHT - 65, BASELINE)],
        "<": [beam(RIGHT, TOP, LEFT, MIDDLE, 64), beam(LEFT, MIDDLE, RIGHT, BASELINE, 64)],
        ">": [beam(LEFT, TOP, RIGHT, MIDDLE, 64), beam(RIGHT, MIDDLE, LEFT, BASELINE, 64)],
        "|": [beam(CENTER, -80, CENTER, TOP + 80, 54)],
        "^": [beam(LEFT + 50, TOP - 260, CENTER, TOP, 54), beam(CENTER, TOP, RIGHT - 50, TOP - 260, 54)],
        "~": [beam(LEFT, MIDDLE, CENTER - 30, MIDDLE + 90, 48), beam(CENTER - 30, MIDDLE + 90, RIGHT, MIDDLE, 48)],
        "`": [beam(CENTER - 25, TOP, CENTER + 28, TOP - 160, 52)],
    }


def add_polygon(pen: TTGlyphPen, points: list[tuple[float, float]]) -> None:
    pen.moveTo(points[0])
    for point in points[1:]:
        pen.lineTo(point)
    pen.closePath()


def add_beam(pen: TTGlyphPen, values: tuple) -> None:
    _, x1, y1, x2, y2, width = values
    distance = math.hypot(x2 - x1, y2 - y1)
    offset_x = -(y2 - y1) * width / (2 * distance)
    offset_y = (x2 - x1) * width / (2 * distance)
    add_polygon(pen, [(x1 + offset_x, y1 + offset_y), (x2 + offset_x, y2 + offset_y), (x2 - offset_x, y2 - offset_y), (x1 - offset_x, y1 - offset_y)])


def add_dot(pen: TTGlyphPen, values: tuple) -> None:
    _, center_x, center_y, radius_x, radius_y = values
    cut_x = radius_x * 0.42
    cut_y = radius_y * 0.42
    add_polygon(pen, [(center_x - radius_x + cut_x, center_y + radius_y), (center_x + radius_x - cut_x, center_y + radius_y), (center_x + radius_x, center_y + radius_y - cut_y), (center_x + radius_x, center_y - radius_y + cut_y), (center_x + radius_x - cut_x, center_y - radius_y), (center_x - radius_x + cut_x, center_y - radius_y), (center_x - radius_x, center_y - radius_y + cut_y), (center_x - radius_x, center_y + radius_y - cut_y)])


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
    if upper_character in LETTER_SEGMENTS:
        return compose(*LETTER_SEGMENTS[upper_character])
    if character in DIGIT_SEGMENTS:
        return compose(*DIGIT_SEGMENTS[character])
    return punctuation.get(character, [])


def glyph_name(character: str) -> str:
    return "space" if character == " " else f"uni{ord(character):04X}"


def advance_width(character: str) -> int:
    if character == " ":
        return SPACE_ADVANCE
    if character in ".,;:'\"!|`":
        return PUNCTUATION_ADVANCE
    return ADVANCE


def supported_characters(punctuation: dict[str, list[tuple]]) -> list[str]:
    letters = list("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
    digits = list("0123456789")
    return [*letters, *digits, *punctuation.keys()]


def build_glyphs(characters: list[str], punctuation: dict[str, list[tuple]]) -> tuple[list[str], dict, dict, dict]:
    glyph_order = [".notdef", ".null", "nonmarkingreturn"]
    glyphs = {".notdef": glyph_from_parts(compose("top", "right", "bottom", "left")), ".null": glyph_from_parts([]), "nonmarkingreturn": glyph_from_parts([])}
    metrics = {".notdef": (ADVANCE, 0), ".null": (0, 0), "nonmarkingreturn": (0, 0)}
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
    glyph_order, glyphs, metrics, cmap = build_glyphs(supported_characters(punctuation), punctuation)
    builder = FontBuilder(UNITS_PER_EM, isTTF=True)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap(cmap)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    builder.setupNameTable({
        "copyright": COPYRIGHT,
        "familyName": FAMILY_NAME,
        "styleName": "Regular",
        "fullName": FAMILY_NAME,
        "uniqueFontIdentifier": f"{FAMILY_NAME}; Version 1.000",
        "psName": "VOLTOrbitDisplay-Regular",
        "version": "Version 1.000",
    })
    builder.setupOS2(
        sTypoAscender=ASCENDER,
        sTypoDescender=DESCENDER,
        usWinAscent=ASCENDER,
        usWinDescent=abs(DESCENDER),
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


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the VOLT Orbit Display webfont.")
    parser.add_argument("--output", default="assets/fonts", help="Output directory relative to the project root.")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    root = Path(__file__).resolve().parents[2]
    output_dir = (root / arguments.output).resolve()
    ttf_path, woff2_path = build_font(output_dir)
    characters = supported_characters(special_parts())
    verify_font(ttf_path, characters)
    verify_font(woff2_path, characters)
    print(f"Built {ttf_path.relative_to(root)} and {woff2_path.relative_to(root)}")


if __name__ == "__main__":
    main()

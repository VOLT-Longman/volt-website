# VOLT Orbit Display

`VOLT Orbit Display` is VOLT's original Latin display face. Its V3 outlines
use rounded terminals and generous counters so the fleet identity stays
legible without leaning on a generic sci-fi or seven-segment treatment.

It is a static **SemiBold** Latin subset. Korean, lowercase Latin, navigation,
badges, metrics, and all body copy must use the product system stack. The live
site uses Orbit only for the English hero title and tagline; CSS limits the
font to its actual uppercase, numeral, and punctuation coverage.

The Node generator is the single source of truth. Generated `.woff2` and
`.ttf` files are committed so production has no font build dependency. Do not
hand-edit either binary.

```powershell
npm run font:build
npm run font:check
```

`font:check` validates the generated sfnt/WOFF2 headers, OpenType metadata,
and the exact glyphs needed by the live hero copy. Browser smoke tests confirm
that the WOFF2 file loads and no hero glyph is clipped.

The design is VOLT-owned. Do not replace it with an externally licensed font
without recording that font's license and attribution.

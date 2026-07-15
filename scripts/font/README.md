# VOLT Orbit Display

`VOLT Orbit Display` is VOLT's original Latin display face. Its V3 outlines
use clipped terminals and generous counters rather than a generic sci-fi or
seven-segment treatment, so the fleet identity stays legible at headline and
cockpit-metric sizes.

It is deliberately a Latin identity experiment. Korean glyphs resolve to the
site's readable Korean fallback stack; it must never replace Korean body copy.
It is not loaded by the live website while its visual language is refined.
Keep hero titles, navigation, metrics, Korean headings and paragraphs in the
product text family until a reviewed production release explicitly adopts it.

The repository ships the generated `.woff2` and `.ttf` files so production
never needs a font build dependency. The generator uses FontTools only when a
designer changes the outlines.

```powershell
$env:VOLT_FONTTOOLS_PATH = 'C:\path\to\fonttools'
& C:\path\to\python.exe scripts\font\generate_volt_orbit.py
```

The design is VOLT-owned. Do not replace it with an externally licensed font
without recording that font's license and attribution. The generator verifies
the subset, cap-height metadata and a 100KB webfont budget on every build.

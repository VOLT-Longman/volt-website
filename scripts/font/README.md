# VOLT Orbit Display

`VOLT Orbit Display` is an original, geometric Latin display face for VOLT's
hero-system numeric readouts. It is not a Korean body-text or headline font:
Korean glyphs intentionally resolve to the site's readable Korean fallback
stack.

The repository ships the generated `.woff2` and `.ttf` files so production
never needs a font build dependency. The generator uses FontTools only when a
designer changes the outlines.

```powershell
$env:VOLT_FONTTOOLS_PATH = 'C:\path\to\fonttools'
& C:\path\to\python.exe scripts\font\generate_volt_orbit.py
```

The design is VOLT-owned. Do not replace it with an externally licensed font
without recording that font's license and attribution.

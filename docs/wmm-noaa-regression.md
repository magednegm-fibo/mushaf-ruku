# WMM2025 NOAA Regression Test

## Purpose

`tests/wmm-noaa-regression.js` validates the **actual** `wmmDeclination()` implementation from `prayer.js` against the official NOAA/NCEI WMM2025 published test values.

The test deliberately does **not** contain a second implementation of the WMM algorithm. It loads `prayer.js` in a minimal browser-like Node VM and calls:

```js
window.Prayer.wmmDeclination(...)
```

This means a future coefficient, epoch, spherical-harmonic, altitude, or date regression in `prayer.js` is tested directly.

## Reference

NOAA/NCEI — *Test Values for WMM2025*.

The reference table contains 12 main-field cases covering:

- 2025.0 and 2027.5
- 0 km and 100 km height
- 80°N, 0°; 0°, 120°E; and 80°S, 240°E

The test checks both:

- Declination `D`: tolerance `0.01°`
- Total field `F`: tolerance `0.10 nT`

The published NOAA values are rounded, so the tolerances are intentionally above display-rounding noise while remaining strict enough to detect meaningful implementation regressions.

## Run

From the release root:

```bash
node tests/wmm-noaa-regression.js
```

Against an unpacked release:

```bash
node tests/wmm-noaa-regression.js --dir /path/to/unzipped-release
```

## 1.0.637 verification

The actual 1.0.637 `prayer.js` implementation passes all 12 NOAA cases.

Maximum observed error:

- `D`: `0.004615°`
- `F`: `0.045380 nT`

Both are below the regression limits.

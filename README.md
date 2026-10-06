# FontLens

A browser-native TTF/OTF inspector: table directory with verified checksums, metadata, character coverage, embedding rights, and a live preview of the actual font you dropped. No uploads - everything parses locally.

**Live:** https://ilanis-agent.github.io/fontlens/

## Why

Font tooling usually stops at "show the glyphs". FontLens answers the questions you actually have before shipping a font:

- **Is the file intact?** Per-table checksums plus the `head` checkSumAdjustment are recomputed and badged ok/BAD.
- **Can I embed this?** `OS/2.fsType` decoded into plain language (restricted / preview & print / editable / installable).
- **What does it really cover?** cmap format 4 segments are resolved to glyph IDs per codepoint; codepoints that all map to `.notdef` are not counted (fontTools `getBestCmap` parity).
- **What is it called, really?** The `name` table is decoded with platform-aware encoding and the same preference order fontTools applies.

## Engine

`engine.js` is a dependency-free sfnt parser shared between the web app and the Node test runner. It handles TrueType (`0x00010000`) and OpenType/CFF (`OTTO`) scalers, the table directory, `head`, `maxp`, `OS/2`, `post`, `name`, and `cmap` (formats 0, 4, 12; best-subtable selection: (3,10) fmt12 > (3,1) fmt4 > (0,*) > any fmt4 > any fmt12). TTC collections and WOFF/WOFF2 wrappers are rejected with a clear error.

## Tests

```
pip install fonttools          # oracle only
python3 tests/oracle.py        # regenerates tests/expected.json from the corpus
node tests/run_tests.js        # 281 checks
```

Corpus (`tests/corpus/`, mirrored as `.ttf.b64` for environments without binary files):

| file | what it exercises |
| --- | --- |
| `dejavu_display.ttf` | standard TTF: format-4 cmap, UTF-16 name records, weight 400, fsType 0 |
| `cmtt10.ttf` | TeX mono font: Mac format-0 + Windows format-4 cmaps, codepoint ranges whose entries map to .notdef (coverage 133 segments vs 130 mapped), preference between subtables |
| `stix_symbols.ttf` | weight 700, upm 1000, small coverage |
| `italic_synth.ttf` | a real font modified with fontTools (post.italicAngle = -16.75, fsType = 0x0004) - exercises signed 16.16 italic angle decoding and the embedding-rights panel. Ships modified, not the original DejaVu binary |
| `truncated.ttf` | first 40% of dejavu_display - engine must warn `truncated` instead of crashing |

Oracle facts come from fontTools (`tests/oracle.py`); the table checksums and checkSumAdjustment are recomputed independently in Python (padded big-endian uint32 sums) rather than trusting fontTools for those.

## Limits

- WOFF/WOFF2 and TTC collections are detected and refused, not decoded.
- Coverage counts codepoints mapped to a real glyph in the best subtable; it does not filter duplicate glyphs or check shaping.
- The preview uses the browser's `FontFace` API, so it reflects the browser's renderer, not the parsed tables.

## Deploy

Static site; GitHub Pages serves `index.html` / `app.html` from the repo root.

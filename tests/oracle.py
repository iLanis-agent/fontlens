#!/usr/bin/env python3
"""Oracle for FontLens: font facts from REAL fontTools, plus independent
python table-checksum + checkSumAdjustment verification over raw bytes."""
from fontTools.ttLib import TTFont
import json, os, struct, warnings
warnings.filterwarnings('ignore')

def u32s(b):
    # big-endian uint32 sum of zero-padded data, mod 2^32
    pad = (4 - len(b) % 4) % 4
    b = b + b'\0' * pad
    s = 0
    for i in range(0, len(b), 4):
        s = (s + struct.unpack('>I', b[i:i+4])[0]) & 0xFFFFFFFF
    return s

def table_checksums(raw, num_tables):
    out = {}
    for i in range(num_tables):
        e = 12 + i*16
        tag = raw[e:e+4].decode('latin1')
        cks, off, ln = struct.unpack('>III', raw[e+4:e+16])
        if off + ln <= len(raw):
            out[tag] = {'recorded': cks, 'computed': u32s(raw[off:off+ln]), 'offset': off, 'length': ln}
    return out

def name_pref(t, nid):
    r = t['name'].getName(nid, 3, 1, 0x409) or t['name'].getName(nid, 1, 0, 0) or t['name'].getDebugName(nid)
    return str(r) if r else None

def dump(path):
    raw = open(path,'rb').read()
    out = {'file': os.path.basename(path), 'size': len(raw)}
    if out['file'] == 'truncated.ttf':
        out['expect_warning'] = 'truncated'
        return out
    t = TTFont(path)
    out['scaler_hex'] = t.sfntVersion.encode('latin1').hex() if isinstance(t.sfntVersion, str) else t.sfntVersion.hex()
    out['num_tables'] = len(t.reader.tables)
    out['tables'] = sorted(t.reader.tables.keys())
    out['num_glyphs'] = t['maxp'].numGlyphs
    out['units_per_em'] = t['head'].unitsPerEm
    out['bbox'] = [t['head'].xMin, t['head'].yMin, t['head'].xMax, t['head'].yMax]
    out['loc_format'] = t['head'].indexToLocFormat
    out['weight_class'] = t['OS/2'].usWeightClass
    out['width_class'] = t['OS/2'].usWidthClass
    out['fs_type'] = t['OS/2'].fsType
    out['italic_angle'] = float(t['post'].italicAngle)
    out['fixed_pitch'] = bool(t['post'].isFixedPitch)
    out['underline_position'] = int(t['post'].underlinePosition)
    for nid, key in [(1,'family'),(2,'subfamily'),(3,'unique'),(4,'full'),(5,'version_str'),(6,'postscript'),(16,'pref_family'),(17,'pref_subfamily')]:
        v = name_pref(t, nid)
        if v: out[key] = v
    # cmap coverage from the best subtable
    best = t.getBestCmap()
    if best:
        cps = sorted(best.keys())
        out['cmap_count'] = len(cps)
        out['cmap_min'] = cps[0]
        out['cmap_max'] = cps[-1]
        out['cmap_sample'] = [cps[0], cps[len(cps)//2], cps[-1]]
    # independent checksum verification over raw bytes
    num = struct.unpack('>H', raw[4:6])[0]
    tabs = table_checksums(raw, num)
    out['table_checksums'] = {k: [v['recorded'], v['computed']] for k, v in tabs.items()}
    out['table_offsets'] = {k: [v['offset'], v['length']] for k, v in tabs.items()}
    # checkSumAdjustment: zero head bytes 8-12, whole-file sum must be 0xB1B0AFBA
    head_off = tabs['head']['offset']
    mod = bytearray(raw)
    mod[head_off+8:head_off+12] = b'\0\0\0\0'
    out['adjustment_val'] = struct.unpack('>I', raw[head_off+8:head_off+12])[0]
    out['adjustment_ok'] = ((u32s(bytes(mod)) + out['adjustment_val']) & 0xFFFFFFFF) == 0xB1B0AFBA
    return out

items = []
for f in ['dejavu_display.ttf','cmtt10.ttf','stix_symbols.ttf','italic_synth.ttf','truncated.ttf']:
    items.append(dump(os.path.join('tests/corpus', f)))
json.dump({'items': items}, open('tests/expected.json','w'), indent=1)
open('tests/expected.json','a').write('\n')
for it in items:
    print(it['file'], it.get('scaler_hex'), 'tables=', it.get('num_tables'), 'glyphs=', it.get('num_glyphs'), 'cmap=', it.get('cmap_count'), 'adj=', it.get('adjustment_ok'))

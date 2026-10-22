"""Generate JPOS color themes (CSS variables) + a WCAG contrast table.

Usage:  python docs/frontend/tools/generate-themes.py <out-dir>
  → <out-dir>/themes.css (paste into src/index.css, @layer base), contrast.md, themes.json

Each theme keeps the default palette's lightness steps and changes hue/saturation,
then lightness is nudged per shade until every key pair passes WCAG AA.
"""
import colorsys, json, sys

SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
DEFAULT = {
  'espresso': ['#faf4ec','#f3e6d4','#e6cdb0','#d3ac85','#b9875c','#946140','#6f4428','#55331d','#3f2616','#2c1a0f','#1c1009'],
  'caramel':  ['#fdf7ee','#f9e9d2','#f2d3a8','#e9bb7e','#dda15e','#cc8745','#b06e34','#8c552a','#6e4324','#58371f','#3e2615'],
  'cream':    ['#fffcf7','#fdf7ee','#f8eddd','#f1e0c8','#e7cfae','#d9b98f','#c49d6e','#a37d52','#7f603f','#634a32','#3d2d1e'],
  'bark':     ['#f8f4f0','#eee5dc','#dccbbb','#c4a991','#a88a70','#876b54','#725843','#5b4535','#47372b','#3a2d24','#211913'],
}

# theme -> palette -> (hue degrees, saturation multiplier)
THEMES = {
  'matcha':   {'espresso': (148, 0.62), 'caramel': (78, 0.70),  'cream': (80, 0.55),  'bark': (110, 0.30)},
  'berry':    {'espresso': (330, 0.72), 'caramel': (342, 0.78), 'cream': (338, 0.55), 'bark': (330, 0.28)},
  'ocean':    {'espresso': (214, 0.85), 'caramel': (188, 0.80), 'cream': (205, 0.55), 'bark': (212, 0.28)},
  'charcoal': {'espresso': (220, 0.14), 'caramel': (40, 0.95),  'cream': (40, 0.18),  'bark': (220, 0.12)},
  'sunset':   {'espresso': (8, 0.95),   'caramel': (22, 1.00),  'cream': (24, 1.00),  'bark': (14, 0.55)},
}

def hex2rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def rgb2hex(c): return '#%02x%02x%02x' % c
def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = c
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)
def blend(fg, bg, alpha):
    return tuple(round(f * alpha + b * (1 - alpha)) for f, b in zip(fg, bg))

def shift(hexc, hue, satmul, dl=0.0):
    r, g, b = [v / 255 for v in hex2rgb(hexc)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = min(1, max(0, l + dl))
    r, g, b = colorsys.hls_to_rgb(hue / 360, l, min(1, s * satmul))
    return tuple(round(v * 255) for v in (r, g, b))

def build(theme):
    if theme == 'espresso':
        return {p: {s: hex2rgb(c) for s, c in zip(SHADES, cols)} for p, cols in DEFAULT.items()}
    spec = THEMES[theme]
    return {p: {s: shift(c, *spec[p]) for s, c in zip(SHADES, DEFAULT[p])} for p in DEFAULT}

# Key pairs: (label, fg, bg, min ratio, alpha of fg over bg)
PAIRS = [
  ('Body text (espresso-900 on cream-100)',          ('espresso', 900), ('cream', 100), 4.5, 1),
  ('Card text (espresso-800 on cream-50)',           ('espresso', 800), ('cream', 50),  4.5, 1),
  ('Secondary text (bark-500 on cream-50)',          ('bark', 500),     ('cream', 50),  4.5, 1),
  ('Secondary text (bark-500 on cream-100)',         ('bark', 500),     ('cream', 100), 4.5, 1),
  ('Link/accent text (caramel-700 on cream-50)',     ('caramel', 700),  ('cream', 50),  4.5, 1),
  ('Primary button (cream-50 on espresso-700)',      ('cream', 50),     ('espresso', 700), 4.5, 1),
  ('Active pill (cream-50 on espresso-800)',         ('cream', 50),     ('espresso', 800), 4.5, 1),
  ('Accent button (espresso-900 on caramel-500)',    ('espresso', 900), ('caramel', 500), 4.5, 1),
  ('Badge info (espresso-700 on cream-300)',         ('espresso', 700), ('cream', 300), 4.5, 1),
  ('Dark badge (caramel-200 on espresso-800)',       ('caramel', 200),  ('espresso', 800), 4.5, 1),
  ('Sidebar link (cream-200 @70% on espresso-900)',  ('cream', 200),    ('espresso', 900), 4.5, 0.7),
]

def check(pal):
    rows = []
    for label, (fp, fs), (bp, bs), need, alpha in PAIRS:
        fg, bg = pal[fp][fs], pal[bp][bs]
        if alpha < 1: fg = blend(fg, bg, alpha)
        rows.append((label, contrast(fg, bg), need))
    return rows

def tune(theme):
    """Nudge lightness of failing shades until every pair passes (non-default themes only)."""
    pal = build(theme)
    if theme == 'espresso':
        return pal
    spec = THEMES[theme]
    adj = {p: {s: 0.0 for s in SHADES} for p in DEFAULT}
    for _ in range(60):
        bad = [(l, r, n) for l, r, n in check(pal) if r < n]
        if not bad: break
        for label, _, _ in bad:
            i = [p[0] for p in PAIRS].index(label)
            _, (fp, fs), (bp, bs), _, _ = PAIRS[i]
            # darken the darker side / lighten the lighter side a little
            if lum(pal[fp][fs]) < lum(pal[bp][bs]):
                adj[fp][fs] -= 0.012; adj[bp][bs] += 0.004
            else:
                adj[bp][bs] -= 0.012; adj[fp][fs] += 0.004
        pal = {p: {s: shift(c, *spec[p], adj[p][sh]) for sh, s, c in zip(SHADES, SHADES, DEFAULT[p])} for p in DEFAULT}
    return pal

ALL = ['espresso'] + list(THEMES)
pals = {t: tune(t) for t in ALL}

# CSS
css = []
for t in ALL:
    sel = ':root,\n  [data-theme="espresso"]' if t == 'espresso' else f'[data-theme="{t}"]'
    css.append(f'  {sel} {{')
    for p in DEFAULT:
        css.append('    ' + ' '.join(f'--{p}-{s}: {" ".join(map(str, pals[t][p][s]))};' for s in SHADES[:6]))
        css.append('    ' + ' '.join(f'--{p}-{s}: {" ".join(map(str, pals[t][p][s]))};' for s in SHADES[6:]))
    css.append('  }')
open(sys.argv[1] + '/themes.css', 'w').write('\n'.join(css) + '\n')

# Contrast table (markdown)
md = ['| Pair | ' + ' | '.join(ALL) + ' |', '|---|' + '---|' * len(ALL)]
ok = True
for i, (label, *_rest) in enumerate(PAIRS):
    cells = []
    for t in ALL:
        r, need = check(pals[t])[i][1:]
        ok &= r >= need
        cells.append(f'{r:.1f} {"✅" if r >= need else "❌"}')
    md.append(f'| {label} | ' + ' | '.join(cells) + ' |')
open(sys.argv[1] + '/contrast.md', 'w', encoding='utf-8').write('\n'.join(md) + '\n')
# swatches for the docs/preview
json.dump({t: {p: {s: rgb2hex(pals[t][p][s]) for s in SHADES} for p in DEFAULT} for t in ALL}, open(sys.argv[1] + '/themes.json', 'w'), indent=1)
print('\n'.join(md)); print('ALL PASS' if ok else 'SOME FAIL')

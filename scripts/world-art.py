# Draws the example world's pictures (tokens in world/assets/tokens, map
# pieces in world/assets/tiles). Token pictures: a bronze ring round a field in
# the creature's colour, with an emblem for who it is. Run it again after
# changing an emblem: python3 scripts/world-art.py
import math
import os

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'world', 'assets', 'tokens')

FRAME = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="field" cx="50%" cy="40%" r="65%">
      <stop offset="0" stop-color="{light}"/>
      <stop offset="1" stop-color="{dark}"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f0cf8a"/>
      <stop offset="0.45" stop-color="#a8742e"/>
      <stop offset="1" stop-color="#4a2e10"/>
    </linearGradient>
  </defs>
  <circle cx="128" cy="128" r="124" fill="url(#ring)"{ghost}/>
  <circle cx="128" cy="128" r="110" fill="url(#field)" stroke="#2a1a08" stroke-width="4"{ghost}/>
  <g fill="none" stroke="#1a1208" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"{ghost}>
{emblem}
  </g>
</svg>
"""

# Emblems: filled shapes drawn with a dark outline (the group's stroke).
BONE, STEEL, CLOTH = '#efe3c8', '#c9ced6', '#3b2c22'
EMBLEMS = {
    # A fighter's crested helm over a sword.
    'bram': ('#d07a50', '#5a2414', f"""
    <path d="M128 30 L128 226" stroke-width="10"/>
    <path d="M100 196 L156 196" stroke-width="10"/>
    <path d="M78 128 C78 80 100 58 128 58 C156 58 178 80 178 128 L178 168 L146 168 L146 130 L110 130 L110 168 L78 168 Z" fill="{STEEL}"/>
    <path d="M128 58 C150 40 170 44 186 60 C166 58 148 66 136 84" fill="#b03020"/>
    <path d="M110 120 L146 120" />"""),
    # A wizard's pointed hat with a star.
    'orrin': ('#6aa0e8', '#14305a', f"""
    <path d="M60 182 C90 166 166 166 196 182 C170 200 86 200 60 182 Z" fill="#2a3f8a"/>
    <path d="M84 176 C100 130 114 84 150 44 C144 86 156 130 172 176 Z" fill="#3050a8"/>
    <path d="M124 116 L130 132 L146 132 L133 142 L138 158 L124 148 L110 158 L115 142 L102 132 L118 132 Z" fill="#f4d860" stroke-width="4"/>"""),
    # An illusionist's half-mask, one side light and one dark.
    'vesper': ('#a888e8', '#2e1a5a', f"""
    <path d="M56 104 C80 84 176 84 200 104 C204 140 176 170 150 166 C140 150 116 150 106 166 C80 170 52 140 56 104 Z" fill="{BONE}"/>
    <path d="M128 92 C150 92 176 94 200 104 C204 140 176 170 150 166 C140 150 132 150 128 150 Z" fill="#3a2a60"/>
    <ellipse cx="96" cy="122" rx="16" ry="10" fill="#1a1208"/>
    <ellipse cx="160" cy="122" rx="16" ry="10" fill="{BONE}"/>
    <path d="M128 60 L128 74 M98 66 L104 78 M158 66 L152 78" stroke="#f4d860" stroke-width="5"/>"""),
    # A foaming tankard.
    'innkeeper': ('#c8a070', '#4a3018', f"""
    <path d="M86 96 L170 96 L164 200 L92 200 Z" fill="#9a6a3a"/>
    <path d="M170 116 C204 116 204 170 166 170" stroke-width="10"/>
    <path d="M80 98 C76 76 96 66 108 74 C114 58 142 58 148 72 C162 62 182 76 174 98 Z" fill="#fbf4e2"/>
    <path d="M92 132 L164 132 M93 166 L163 166" />"""),
    # A goblin's head: long ears, wide grin.
    'goblin': ('#7aaa4a', '#1e3a10', f"""
    <path d="M86 112 L30 84 L84 140 Z" fill="#6a9a3a"/>
    <path d="M170 112 L226 84 L172 140 Z" fill="#6a9a3a"/>
    <path d="M84 120 C84 82 106 66 128 66 C150 66 172 82 172 120 C172 166 152 194 128 194 C104 194 84 166 84 120 Z" fill="#88b850"/>
    <ellipse cx="108" cy="118" rx="10" ry="8" fill="#f0d040"/>
    <ellipse cx="148" cy="118" rx="10" ry="8" fill="#f0d040"/>
    <path d="M100 154 C116 170 140 170 156 154 L150 160 L144 152 L136 162 L128 152 L120 162 L112 152 L106 160 Z" fill="{BONE}" stroke-width="4"/>"""),
    # A wolf's head seen from the front.
    'wolf': ('#9a9a9a', '#2a2a2a', f"""
    <path d="M80 104 L72 46 L112 84 Z" fill="#6a6a6a"/>
    <path d="M176 104 L184 46 L144 84 Z" fill="#6a6a6a"/>
    <path d="M76 110 C76 80 100 74 128 74 C156 74 180 80 180 110 C180 140 160 160 146 196 L110 196 C96 160 76 140 76 110 Z" fill="#8a8a8a"/>
    <path d="M110 196 C112 176 144 176 146 196 Z" fill="#dcdcdc"/>
    <ellipse cx="128" cy="196" rx="12" ry="8" fill="#1a1208"/>
    <path d="M98 122 L116 128 M158 122 L140 128" stroke="#f0c040" stroke-width="8"/>"""),
    # A hooded face with a cloth over the mouth.
    'bandit': ('#8a7a5a', '#2a2014', f"""
    <path d="M62 196 C62 110 88 54 128 54 C168 54 194 110 194 196 Z" fill="#4a5a34"/>
    <path d="M92 196 C92 132 106 98 128 98 C150 98 164 132 164 196 Z" fill="#c89a70"/>
    <path d="M92 146 C110 140 146 140 164 146 L164 196 L92 196 Z" fill="#6a2a20"/>
    <path d="M106 124 L120 126 M150 124 L136 126" stroke-width="8"/>"""),
    # A plumed hat over crossed blades.
    'bandit-captain': ('#b8905a', '#3a2410', f"""
    <path d="M58 214 L198 58 M198 214 L58 58" stroke="{STEEL}" stroke-width="14"/>
    <path d="M58 214 L198 58 M198 214 L58 58" stroke-width="3"/>
    <path d="M52 150 C80 130 176 130 204 150 C176 170 80 170 52 150 Z" fill="#3a2a1a"/>
    <path d="M90 146 C90 104 110 90 128 90 C146 90 166 104 166 146 Z" fill="#4a3424"/>
    <path d="M150 104 C170 70 200 62 222 70 C196 80 180 96 164 122" fill="#c83030"/>"""),
    # A strung bow and an arrow.
    'scout': ('#7aa070', '#1e3018', f"""
    <path d="M92 44 C170 70 170 186 92 212" stroke="#8a5a2a" stroke-width="12"/>
    <path d="M92 44 L92 212" stroke-width="3"/>
    <path d="M70 128 L206 128" stroke-width="6"/>
    <path d="M206 128 L184 116 L188 128 L184 140 Z" fill="{STEEL}" stroke-width="4"/>
    <path d="M70 128 L58 116 M70 128 L58 140 M82 128 L70 116 M82 128 L70 140" stroke="#c83030" stroke-width="5"/>"""),
    # A sack of flour by a millstone.
    'miller': ('#d8c8a0', '#5a4a2a', f"""
    <circle cx="96" cy="150" r="52" fill="#9a9488"/>
    <circle cx="96" cy="150" r="12" fill="#3a3428"/>
    <path d="M150 92 C138 92 136 104 142 110 C124 130 122 176 132 200 L196 200 C206 176 204 130 186 110 C192 104 190 92 178 92 Z" fill="#f2ead6"/>
    <path d="M142 110 L186 110" stroke-width="5"/>
    <path d="M150 150 L178 150 M154 166 L174 166" stroke="#a08a5a" stroke-width="5"/>"""),
}

def shade(hexcolor, k):
    r, g, b = (int(hexcolor[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % tuple(min(255, int(c * k)) for c in (r, g, b))

def write(name, light, dark, emblem, ghost=''):
    svg = FRAME.format(light=light, dark=dark, emblem=emblem.strip('\n'), ghost=ghost)
    with open(os.path.join(HERE, f'{name}.svg'), 'w') as fh:
        fh.write(svg)

for name, (light, dark, emblem) in EMBLEMS.items():
    write(name, light, dark, emblem)
# The phantom wolf is the wolf as a pale, see-through ghost.
write('phantom-wolf', '#c8c8f8', '#30306a', EMBLEMS['wolf'][2].replace('#8a8a8a', '#b8b8e8').replace('#6a6a6a', '#9898d0'), ' opacity="0.8"')

# Map pieces for the Mill Road scene: tree crowns seen from above, a mill wheel.
TILES = os.path.join(HERE, '..', 'tiles')
os.makedirs(TILES, exist_ok=True)

def crown(name, colours, lobes):
    """A tree crown: overlapping lobes in two greens with a shadow."""
    dark, mid, light = colours
    parts = [f'<circle cx="{128 + 6}" cy="{128 + 8}" r="112" fill="#000" opacity="0.25"/>']
    for (cx, cy, r) in lobes:
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{mid}" stroke="{dark}" stroke-width="5"/>')
    for (cx, cy, r) in lobes:
        parts.append(f'<circle cx="{cx - r * 0.25:.0f}" cy="{cy - r * 0.25:.0f}" r="{r * 0.55:.0f}" fill="{light}" opacity="0.7"/>')
    body = '\n  '.join(parts)
    with open(os.path.join(TILES, f'{name}.svg'), 'w') as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">\n  {body}\n</svg>\n')

crown('oak', ('#1e3a14', '#3e6a28', '#6a9a40'),
      [(128, 70, 56), (70, 120, 54), (186, 120, 54), (96, 180, 54), (162, 182, 54), (128, 128, 60)])
crown('pine', ('#10301e', '#285a3a', '#4a8a5a'),
      [(128, 128, 96), (128, 128, 66), (128, 128, 36)])
crown('birch', ('#2a4a18', '#5a8a30', '#9ac060'),
      [(100, 92, 44), (160, 96, 42), (128, 150, 48), (84, 160, 36), (176, 160, 36)])

WHEEL = ['<circle cx="128" cy="128" r="118" fill="#5a3a1e" stroke="#2a1a08" stroke-width="8"/>',
         '<circle cx="128" cy="128" r="88" fill="none" stroke="#2a1a08" stroke-width="6"/>',
         '<circle cx="128" cy="128" r="22" fill="#3a2a18" stroke="#1a1208" stroke-width="6"/>']
for i in range(8):
    a = i * math.pi / 4
    x, y = 128 + 112 * math.cos(a), 128 + 112 * math.sin(a)
    WHEEL.append(f'<path d="M128 128 L{x:.0f} {y:.0f}" stroke="#2a1a08" stroke-width="10"/>')
    WHEEL.append(f'<path d="M128 128 L{x:.0f} {y:.0f}" stroke="#8a5a2e" stroke-width="5"/>')
with open(os.path.join(TILES, 'mill-wheel.svg'), 'w') as fh:
    fh.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">\n  ' + '\n  '.join(WHEEL) + '\n</svg>\n')

// Draws the rehearsal-room wall behind the app: marker doodles of instruments, tapes and a few
// film props (bowling pins, a White Russian, the rug, an amp that goes to eleven). Objects only, no characters.
// Writes public/doodles-light.svg and public/doodles-dark.svg (one seamless tile each).
// Usage: node tools/doodles.mjs

import rough from 'roughjs';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const W = 820;
const H = 820;
const gen = rough.generator();
let seed = 7;

// rough marks: outline stroke 'S', hachure lines 'F'; we map them to CSS classes afterwards
const base = (o = {}) => ({ roughness: 1.15, bowing: 0.9, stroke: 'S', strokeWidth: 1, seed: seed++, ...o });
const fillOpt = (style = 'hachure', o = {}) =>
  base({ fill: 'F', fillStyle: style, hachureGap: 6, fillWeight: 1, hachureAngle: -41, disableMultiStrokeFill: true, ...o });

const R = (x, y, w, h, o) => gen.rectangle(x, y, w, h, o || base());
const C = (cx, cy, d, o) => gen.circle(cx, cy, d, o || base());
const E = (cx, cy, w, h, o) => gen.ellipse(cx, cy, w, h, o || base());
const L = (x1, y1, x2, y2, o) => gen.line(x1, y1, x2, y2, o || base());
const P = (pts, o) => gen.polygon(pts, o || base());
const LP = (pts, o) => gen.linearPath(pts, o || base());
const CV = (pts, o) => gen.curve(pts, o || base());
const PA = (d, o) => gen.path(d, o || base());
const A = (cx, cy, w, h, a0, a1, o) => gen.arc(cx, cy, w, h, a0, a1, false, o || base());

// one decimal is plenty for a 2px marker line; drop the separators SVG does not need
const round = (d) =>
  d
    .replace(/-?\d+\.\d+/g, (n) => String(Math.round(+n * 10) / 10))
    .replace(/,\s*/g, ' ')
    .replace(/\s+(?=-)/g, '')
    .replace(/([MLC])\s+/g, '$1')
    .replace(/\s+([MLC])/g, '$1')
    .replace(/(^|[\s MLC-])0\./g, '$1.');

/** shape list item: [drawable, strokeClass, fillClass] */
function svgOf(items) {
  let out = '';
  for (const [dr, k = 'k', f = 'kf'] of items) {
    for (const p of gen.toPaths(dr)) {
      if (p.fill && p.fill !== 'none') out += `<path class="${f}" d="${round(p.d)}"/>`;
      else out += `<path class="${p.stroke === 'F' ? f : k}" d="${round(p.d)}"/>`;
    }
  }
  return out;
}

const rot = (pts, deg, cx = 0, cy = 0) => {
  const a = (deg * Math.PI) / 180;
  return pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
};

// ------------------------------------------------------------------ the doodles (local coords around 0,0)

const D = {
  electric: () => [
    [PA('M -9 -25 C -14 -35, -21 -48, -28 -46 C -39 -41, -41 -21, -37 -7 C -32 7, -46 16, -44 32 C -41 51, -18 57, 0 55 C 21 53, 41 46, 41 25 C 41 11, 30 5, 32 -7 C 34 -18, 37 -35, 28 -37 C 21 -38, 14 -32, 9 -25 Z', base({ fill: 'B', fillStyle: 'solid' })), 'k', 'bg'],
    [R(-5.5, -125, 11, 101), 'k'],
    [P([[-7, -125], [9, -125], [12, -156], [-3, -160]]), 'k'],
    ...[-133, -142, -151].map((y) => [C(-8, y, 4.5, base({ roughness: 0.5 })), 'k']),
    ...[-110, -97, -85, -74, -64, -55, -47, -40, -33].map((y) => [L(-5, y, 5, y, base({ roughness: 0.4 })), 'kf']),
    [R(-13, -2, 26, 7), 'k'],
    [R(-13, 12, 26, 7), 'k'],
    [R(-11, 31, 22, 5), 'k'],
    [C(23, 31, 8, base({ roughness: 0.6 })), 'r'],
    [C(29, 42, 8, base({ roughness: 0.6 })), 'r'],
    [L(-2, -124, -2, 33, base({ roughness: 0.3 })), 'kf'],
    [L(2, -124, 2, 33, base({ roughness: 0.3 })), 'kf'],
  ],
  acoustic: () => [
    [PA('M 0 -38 C 20 -38, 29 -25, 27 -9 C 26 0, 22 5, 25 9 C 38 14, 41 34, 36 47 C 29 67, -29 67, -36 47 C -41 34, -38 14, -25 9 C -22 5, -26 0, -27 -9 C -29 -25, -20 -38, 0 -38 Z', base({ fill: 'B', fillStyle: 'solid' })), 'k', 'bg'],
    [C(0, 4, 21), 'k'],
    [C(0, 4, 28, base({ roughness: 0.6 })), 'kf'],
    [R(-12, 40, 24, 5), 'k'],
    [R(-5, -128, 10, 90), 'k'],
    [P([[-8, -152], [8, -152], [7, -128], [-7, -128]]), 'k'],
    ...[-112, -98, -85, -73, -62, -52].map((y) => [L(-4.5, y, 4.5, y, base({ roughness: 0.4 })), 'kf']),
    ...[-2.5, 0, 2.5].map((x) => [L(x, -128, x, 42, base({ roughness: 0.3 })), 'kf']),
  ],
  drums: () => {
    const shell = (cx, top, w, h, d) => [
      [E(cx, top, w, h), 'k'],
      [L(cx - w / 2, top, cx - w / 2, top + d), 'k'],
      [L(cx + w / 2, top, cx + w / 2, top + d), 'k'],
      [A(cx, top + d, w, h, 0, Math.PI), 'k'],
    ];
    return [
      ...shell(-64, -2, 46, 13, 18),
      [LP([[-64, 22], [-64, 58]]), 'k'],
      [LP([[-76, 72], [-64, 58], [-52, 72]]), 'k'],
      [C(0, 30, 88, base({ fill: 'B', fillStyle: 'solid' })), 'k', 'bg'],
      [C(0, 30, 70), 'kf'],
      [E(0, 30, 36, 16, base({ fill: 'F', fillStyle: 'solid' })), 'r', 'rs'],
      [L(-32, 60, -42, 74), 'k'],
      [L(32, 60, 42, 74), 'k'],
      ...shell(20, -26, 38, 11, 16),
      [E(70, -48, 56, 9), 'k'],
      [C(70, -51, 9, base({ roughness: 0.5 })), 'k'],
      [L(70, -44, 70, 62), 'k'],
      [LP([[58, 74], [70, 62], [82, 74]]), 'k'],
      [L(-40, -46, 6, -12, base({ roughness: 0.5 })), 'r'],
      [L(-20, -52, -46, -10, base({ roughness: 0.5 })), 'r'],
    ];
  },
  sticks: () => {
    const stick = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const nx = (-(y2 - y1) / len) * 2.6;
      const ny = ((x2 - x1) / len) * 2.6;
      return [
        [P([[x1 + nx, y1 + ny], [x2 + nx * 0.6, y2 + ny * 0.6], [x2 - nx * 0.6, y2 - ny * 0.6], [x1 - nx, y1 - ny]], base({ roughness: 0.7 })), 'k'],
        [E(x2 + (x2 - x1) / len * 3, y2 + (y2 - y1) / len * 3, 8, 8, base({ roughness: 0.5 })), 'k'],
      ];
    };
    return [...stick(-52, -40, 44, 38), ...stick(52, -40, -44, 38)];
  },
  amp: () => [
    [R(-62, -44, 124, 94), 'k'],
    [PA('M -18 -44 C -18 -58, 18 -58, 18 -44'), 'k'],
    [L(-62, -18, 62, -18), 'k'],
    ...[-48, -32, -16, 0, 16].map((x) => [C(x, -31, 10, base({ roughness: 0.5 })), 'k']),
    [C(34, -31, 13, base({ roughness: 0.5, fill: 'F', fillStyle: 'solid' })), 'r', 'rs'],
    // the knob that goes to eleven
    [LP([[45, -36], [48, -39], [48, -25]], base({ roughness: 0.3 })), 'r'],
    [LP([[52, -36], [55, -39], [55, -25]], base({ roughness: 0.3 })), 'r'],
    [R(-54, -10, 108, 52, fillOpt('cross-hatch', { hachureGap: 8 })), 'k', 'kf'],
    [R(-58, 50, 12, 5), 'k'],
    [R(46, 50, 12, 5), 'k'],
  ],
  mic: () => [
    [C(0, -42, 32, fillOpt('cross-hatch', { hachureGap: 5.5 })), 'k', 'kf'],
    [R(-11, -27, 22, 6), 'k'],
    [P([[-10, -21], [10, -21], [6, 32], [-6, 32]]), 'k'],
    [R(-3, -6, 6, 9), 'r'],
    [CV([[0, 32], [3, 46], [-10, 58], [4, 72], [24, 68], [34, 80]]), 'k'],
  ],
  cassette: () => [
    [R(-62, -39, 124, 78), 'k'],
    [R(-52, -31, 104, 36), 'k'],
    [L(-44, -24, 16, -24, base({ roughness: 1.6 })), 'r'],
    [R(-28, -18, 56, 16), 'kf'],
    [C(-18, -10, 19), 'k'],
    [C(18, -10, 19), 'k'],
    [C(-18, -10, 6, base({ roughness: 0.4 })), 'k'],
    [C(18, -10, 6, base({ roughness: 0.4 })), 'k'],
    [P([[-40, 39], [-31, 22], [31, 22], [40, 39]]), 'k'],
    [C(-16, 31, 5, base({ roughness: 0.3 })), 'k'],
    [C(16, 31, 5, base({ roughness: 0.3 })), 'k'],
  ],
  vinyl: () => [
    [R(-74, -58, 108, 116), 'k'],
    [L(-64, -46, -10, -46, base({ roughness: 1.4 })), 'kf'],
    [C(14, 0, 108, base({ fill: 'B', fillStyle: 'solid' })), 'k', 'bg'],
    [C(14, 0, 92, base({ roughness: 0.7 })), 'kf'],
    [C(14, 0, 74, base({ roughness: 0.7 })), 'kf'],
    [C(14, 0, 36, base({ fill: 'F', fillStyle: 'solid' })), 'r', 'rs'],
    [C(14, 0, 5, base({ roughness: 0.3 })), 'k'],
  ],
  headphones: () => [
    [A(0, 4, 96, 96, Math.PI, Math.PI * 2), 'k'],
    [A(0, 4, 84, 84, Math.PI * 1.05, Math.PI * 1.95, base({ roughness: 0.6 })), 'kf'],
    [R(-58, -2, 17, 38), 'k'],
    [R(41, -2, 17, 38), 'k'],
    [R(-42, 4, 6, 26), 'r'],
    [R(36, 4, 6, 26), 'r'],
  ],
  pick: (red = false) => [
    [PA('M 0 -15 C 11 -15, 17 -11, 16 -4 C 14 6, 5 15, 0 18 C -5 15, -14 6, -16 -4 C -17 -11, -11 -15, 0 -15 Z', base({ roughness: 0.7, ...(red ? { fill: 'F', fillStyle: 'solid' } : {}) })), red ? 'r' : 'k', red ? 'rs' : 'kf'],
  ],
  bowling: () => {
    const pin = (x, y) => [
      [PA(`M ${x} ${y - 45} C ${x + 8} ${y - 45}, ${x + 10} ${y - 36}, ${x + 8} ${y - 27} C ${x + 6} ${y - 21}, ${x + 5} ${y - 16}, ${x + 6} ${y - 11} C ${x + 14} ${y - 2}, ${x + 18} ${y + 12}, ${x + 16} ${y + 25} C ${x + 14} ${y + 36}, ${x + 9} ${y + 42}, ${x + 7} ${y + 45} L ${x - 7} ${y + 45} C ${x - 9} ${y + 42}, ${x - 14} ${y + 36}, ${x - 16} ${y + 25} C ${x - 18} ${y + 12}, ${x - 14} ${y - 2}, ${x - 6} ${y - 11} C ${x - 5} ${y - 16}, ${x - 6} ${y - 21}, ${x - 8} ${y - 27} C ${x - 10} ${y - 36}, ${x - 8} ${y - 45}, ${x} ${y - 45} Z`, base({ roughness: 0.8, fill: 'B', fillStyle: 'solid' })), 'k', 'bg'],
      [L(x - 6, y - 18, x + 6, y - 18, base({ roughness: 0.3 })), 'r'],
      [L(x - 6, y - 14, x + 6, y - 14, base({ roughness: 0.3 })), 'r'],
    ];
    return [
      ...pin(-24, 4),
      ...pin(24, 4),
      ...pin(0, -6),
      [C(40, 38, 48, base({ fill: 'B', fillStyle: 'solid' })), 'k', 'bg'],
      [C(33, 28, 7, base({ roughness: 0.4 })), 'k'],
      [C(42, 26, 7, base({ roughness: 0.4 })), 'k'],
      [C(38, 37, 9, base({ roughness: 0.4 })), 'k'],
    ];
  },
  russian: () => [
    [P([[-30, -38], [30, -38], [26, 40], [-26, 40]]), 'k'],
    [L(-28, -16, 28, -16), 'k'],
    [CV([[-20, -6], [-6, 4], [-16, 15], [4, 22], [15, 10], [4, -1]], base({ roughness: 0.8 })), 'kf'],
    [P([[-17, -28], [-2, -32], [2, -17], [-13, -13]], base({ roughness: 0.7 })), 'k'],
    [P([[4, -26], [18, -23], [16, -9], [2, -11]], base({ roughness: 0.7 })), 'k'],
    [L(-25, 32, 25, 32), 'kf'],
    [L(14, -58, 3, 2, base({ roughness: 0.5 })), 'r'],
    [L(18, -57, 7, 2, base({ roughness: 0.5 })), 'r'],
  ],
  rug: () => {
    const outer = [[-72, -30], [50, -47], [74, 30], [-48, 47]];
    const inner = outer.map(([x, y]) => [x * 0.8, y * 0.76]);
    const fringe = [];
    const edge = (a, b, dx, dy) => {
      for (let t = 0.06; t < 1; t += 0.11) {
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        fringe.push([L(x, y, x + dx, y + dy, base({ roughness: 0.4 })), 'k']);
      }
    };
    edge(outer[0], outer[3], -9, 2);
    edge(outer[1], outer[2], 9, -2);
    return [
      [P(outer), 'k'],
      [P(inner), 'kf'],
      [P([[-22, 1], [0, -15], [25, -1], [3, 15]], fillOpt('hachure', { hachureGap: 5, hachureAngle: 30 })), 'r', 'rf'],
      [C(1, 0, 8, base({ roughness: 0.4 })), 'k'],
      ...fringe,
    ];
  },
  clapper: () => {
    const open = rot([[-50, -34], [50, -34], [50, -22], [-50, -22]], -18, -50, -22);
    const stripes = [];
    for (let i = 0; i < 4; i++) {
      const x = -40 + i * 24;
      stripes.push([P([[x, -22], [x + 12, -22], [x + 4, -10], [x - 8, -10]].map(([a, b]) => [a, b]), fillOpt('hachure', { hachureGap: 3.5, roughness: 0.6 })), 'k', 'kf']);
    }
    const tStripes = [];
    for (let i = 0; i < 4; i++) {
      const x = -40 + i * 24;
      tStripes.push([P(rot([[x, -34], [x + 12, -34], [x + 4, -22], [x - 8, -22]], -18, -50, -22), fillOpt('hachure', { hachureGap: 3.5, roughness: 0.6 })), 'k', 'kf']);
    }
    return [
      [R(-50, -10, 100, 62), 'k'],
      [R(-50, -22, 100, 12), 'k'],
      ...stripes,
      [P(open), 'k'],
      ...tStripes,
      [C(-48, -22, 5, base({ roughness: 0.3 })), 'k'],
      [L(-44, 8, 44, 8, base({ roughness: 0.5 })), 'kf'],
      [L(-44, 24, 44, 24, base({ roughness: 0.5 })), 'kf'],
      [L(-44, 40, 44, 40, base({ roughness: 0.5 })), 'kf'],
      [L(0, -10, 0, 24, base({ roughness: 0.5 })), 'kf'],
    ];
  },
  popcorn: () => [
    ...[[-21, -22, 16], [-8, -29, 18], [7, -27, 17], [19, -21, 15], [-14, -37, 15], [2, -41, 16], [15, -35, 14]].map(([x, y, d]) => [C(x, y, d, base({ roughness: 0.9, fill: 'B', fillStyle: 'solid' })), 'k', 'bg']),
    [P([[-28, -16], [28, -16], [20, 46], [-20, 46]], base({ fill: 'B', fillStyle: 'solid' })), 'k', 'bg'],
    ...[-14, 0, 14].map((x) => [P([[x - 4, -16], [x + 4, -16], [x * 0.72 + 3, 46], [x * 0.72 - 3, 46]], fillOpt('hachure', { hachureGap: 2.6, hachureAngle: 80, roughness: 0.5 })), 'r', 'rf']),
  ],
  reel: () => [
    [C(0, 0, 86), 'k'],
    [C(0, 0, 13, base({ roughness: 0.4 })), 'k'],
    ...[0, 72, 144, 216, 288].map((a) => {
      const r = (a * Math.PI) / 180;
      return [C(Math.cos(r) * 25, Math.sin(r) * 25, 21, base({ roughness: 0.6 })), 'k'];
    }),
    [CV([[34, 26], [58, 44], [92, 46]]), 'k'],
    [CV([[28, 34], [54, 55], [91, 58]]), 'k'],
    ...[[52, 47], [64, 51], [76, 52], [88, 52]].map(([x, y]) => [R(x - 2, y - 2, 4, 4, base({ roughness: 0.3 })), 'kf']),
  ],
  fin: () => [
    [PA('M -12 12 C -8 -8, 2 -30, 24 -42 C 17 -22, 18 -6, 26 12'), 'k'],
    [CV([[-58, 12], [-44, 5], [-30, 13], [-16, 6], [-2, 14], [12, 6], [26, 13], [40, 6], [54, 13], [66, 9]]), 'k'],
    [CV([[-44, 26], [-30, 20], [-16, 27], [-2, 21], [12, 27], [26, 21], [40, 27], [52, 23]], base({ roughness: 0.8 })), 'kf'],
  ],
  pills: () => {
    const cap = (cx, cy, deg, red) => {
      const pts = rot([[-16, -7], [8, -7], [16, 0], [8, 7], [-16, 7], [-23, 0]], deg).map(([x, y]) => [x + cx, y + cy]);
      const mid = rot([[-4, -7], [-4, 7]], deg).map(([x, y]) => [x + cx, y + cy]);
      return [
        [CV([...pts, pts[0]], base({ roughness: 0.6, ...(red ? { fill: 'F', fillStyle: 'solid' } : {}) })), red ? 'r' : 'k', red ? 'rs' : 'kf'],
        [L(mid[0][0], mid[0][1], mid[1][0], mid[1][1], base({ roughness: 0.3 })), red ? 'r' : 'k'],
      ];
    };
    return [...cap(-14, -6, -18, true), ...cap(16, 12, 24, false)];
  },
  bolt: () => [
    [P([[6, -42], [-17, 4], [-2, 4], [-9, 42], [17, -9], [2, -9], [12, -42]], fillOpt('hachure', { hachureGap: 4.5, hachureAngle: 60 })), 'r', 'rf'],
  ],
  notes: () => [
    [E(-12, 22, 15, 10, base({ roughness: 0.6, fill: 'F', fillStyle: 'solid' })), 'k', 'ks'],
    [E(14, 15, 15, 10, base({ roughness: 0.6, fill: 'F', fillStyle: 'solid' })), 'k', 'ks'],
    [L(-5, 21, -5, -16, base({ roughness: 0.4 })), 'k'],
    [L(21, 14, 21, -23, base({ roughness: 0.4 })), 'k'],
    [P([[-5, -16], [21, -23], [21, -16], [-5, -9]], base({ roughness: 0.4, fill: 'F', fillStyle: 'solid' })), 'k', 'ks'],
  ],
  note: () => [
    [E(-6, 16, 15, 10, base({ roughness: 0.6, fill: 'F', fillStyle: 'solid' })), 'k', 'ks'],
    [L(1, 15, 1, -22, base({ roughness: 0.4 })), 'k'],
    [PA('M 1 -22 C 8 -16, 16 -14, 13 -2', base({ roughness: 0.5 })), 'k'],
  ],
  star: (red = false, s = 1) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 6 : 15) * s;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return [[P(pts, base({ roughness: 0.6 })), red ? 'r' : 'k']];
  },
  spark: () => [
    [L(-8, 0, 8, 0, base({ roughness: 0.3 })), 'k'],
    [L(0, -8, 0, 8, base({ roughness: 0.3 })), 'k'],
  ],
};

// ------------------------------------------------------------------ layout of one tile: [doodle, x, y, rotation, radius]

const LAYOUT = [
  ['electric', 104, 150, -34, 105],
  ['cassette', 330, 92, 8, 72],
  ['star', 470, 40, 0, 18],
  ['bowling', 610, 118, -6, 70],
  ['pick', 772, 34, 20, 20, true],
  ['sticks', 236, 262, 12, 66],
  ['russian', 420, 246, 6, 62],
  ['notes', 560, 300, -8, 30],
  ['reel', 714, 270, 0, 70],
  ['amp', 118, 430, -5, 80],
  ['vinyl', 334, 448, 0, 80],
  ['bolt', 486, 414, 14, 44],
  ['clapper', 640, 452, -10, 70],
  ['spark', 790, 380, 0, 10],
  ['mic', 54, 650, 24, 70],
  ['rug', 252, 620, -6, 84],
  ['headphones', 446, 596, 8, 64],
  ['popcorn', 610, 620, 6, 54],
  ['acoustic', 760, 610, 26, 110],
  ['pills', 360, 762, 0, 34],
  ['fin', 540, 770, 0, 66],
  ['drums', 166, 786, 0, 100],
  ['note', 470, 690, 10, 24],
  ['star', 270, 360, 0, 18, false, 0.8],
  ['pick', 28, 300, -30, 20],
  ['spark', 590, 210, 0, 10],
  ['star', 704, 372, 0, 18, true, 0.7],
  ['star', 726, 748, 0, 18, false, 0.9],
  ['spark', 690, 700, 0, 10],
  ['pick', 400, 352, 12, 20],
];

function tile() {
  let body = '';
  for (const [name, x, y, deg, r, ...args] of LAYOUT) {
    const inner = svgOf(D[name](...args));
    // copies across the edges keep the pattern seamless
    for (const dx of [0, -W, W]) {
      for (const dy of [0, -H, H]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + r < 0 || cx - r > W || cy + r < 0 || cy - r > H) continue;
        body += `<g transform="translate(${cx} ${cy}) rotate(${deg})">${inner}</g>`;
      }
    }
  }
  return body;
}

const THEMES = {
  light: { ink: '#2b2b31', red: '#d62a1e', bg: '#e5e6e2', k: 0.3, kf: 0.17, r: 0.45, rf: 0.3, rs: 0.18, ks: 0.26 },
  dark: { ink: '#eceef2', red: '#ff6b5d', bg: '#1c1d20', k: 0.16, kf: 0.09, r: 0.32, rf: 0.22, rs: 0.14, ks: 0.14 },
};

const body = tile();
for (const [name, t] of Object.entries(THEMES)) {
  const css = [
    `path{fill:none;stroke-linecap:round;stroke-linejoin:round}`,
    `.k{stroke:${t.ink};stroke-opacity:${t.k};stroke-width:2.1}`,
    `.kf{stroke:${t.ink};stroke-opacity:${t.kf};stroke-width:1.4}`,
    `.r{stroke:${t.red};stroke-opacity:${t.r};stroke-width:2.1}`,
    `.rf{stroke:${t.red};stroke-opacity:${t.rf};stroke-width:1.5}`,
    `.rs{fill:${t.red};fill-opacity:${t.rs};stroke:none}`,
    `.ks{fill:${t.ink};fill-opacity:${t.ks};stroke:none}`,
    `.bg{fill:${t.bg};stroke:none}`,
  ].join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${css}</style>${body}</svg>\n`;
  await writeFile(join(root, `public/doodles-${name}.svg`), svg);
  console.log(name, svg.length, 'bytes');
}

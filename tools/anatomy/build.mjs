// Builds the ingredient anatomy figures with the Anatomy kit (github.com/wheresryan22/anatomy, MIT)
// and writes each one into index.html between its <!-- anatomy:name --> markers.
// Usage: node tools/anatomy/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, "..", "..", "index.html");

const WIDTH = 400;
const HEIGHT = 500;

// World units, z up; the board's top is z = 0.
const BOARD = { x: -90, y: -74, w: 180, d: 146, r: 9 };
const BOARD_H = 9;
const FOOT_H = 4;
const SLICE_H = 13;
const SLICE_AT = [-16, 50]; // bottom-centre of the slice; the dome points away from the viewer
const SLICE_SCALE = 1.14;
const CRUST = 4.6;
const JAR = [61, -50];
const JAR_R = 13;

const random = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const smooth = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// The slice's cut face in its own plane: u across, v up from the bottom crust.
function sliceProfile() {
  const half = 54, corner = 9, shoulder = 56, crown = 44, flare = 3, n = 2.4;
  const points = [];
  for (let i = 0; i < 8; i++) points.push([-half + corner + ((2 * half - 2 * corner) * i) / 8, 0]);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / 6);
    points.push([half - corner + corner * Math.cos(a), corner + corner * Math.sin(a)]);
  }
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    points.push([half + flare * t * t, corner + (shoulder - corner) * t]);
  }
  const reach = half + flare;
  for (let i = 0; i <= 28; i++) {
    const t = (Math.PI * i) / 28;
    const c = Math.cos(t), s = Math.sin(t);
    points.push([reach * Math.sign(c) * Math.abs(c) ** (2 / n), shoulder + crown * Math.abs(s) ** (2 / n)]);
  }
  for (let i = 1; i <= 6; i++) {
    const t = 1 - i / 6;
    points.push([-(half + flare * t * t), corner + (shoulder - corner) * t]);
  }
  for (let i = 1; i < 6; i++) {
    const a = Math.PI + (Math.PI / 2) * (i / 6);
    points.push([-half + corner + corner * Math.cos(a), corner + corner * Math.sin(a)]);
  }
  return points;
}

// Moves every point of a counter-clockwise ring inward by `by`.
function inset(points, by) {
  const count = points.length;
  return points.map(([x, y], i) => {
    const [px, py] = points[(i + count - 1) % count];
    const [nx, ny] = points[(i + 1) % count];
    let tx = nx - px, ty = ny - py;
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    return [x - ty * by, y + tx * by];
  });
}

function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// An Archimedean swirl centred in the crumb, r growing by `gap` per turn.
function swirl(from, to, gap, offset, steps = 220) {
  const centre = [1, 45];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps;
    const r = 3 + (gap * t) / (Math.PI * 2) + offset + 1.7 * Math.sin(2 * t + 0.5) + 1.1 * Math.sin(3.3 * t);
    return [centre[0] + r * Math.cos(t), centre[1] + r * Math.sin(t) * 0.86];
  });
}

function ribbon(centre, width) {
  const left = [], right = [];
  centre.forEach(([x, y], i) => {
    const [ax, ay] = centre[Math.max(0, i - 1)];
    const [bx, by] = centre[Math.min(centre.length - 1, i + 1)];
    let tx = bx - ax, ty = by - ay;
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    const w = width(i / (centre.length - 1)) / 2;
    left.push([x - ty * w, y + tx * w]);
    right.push([x + ty * w, y - tx * w]);
  });
  return [...left, ...right.reverse()];
}

function strawberry() {
  const profile = sliceProfile();
  const toWorld = ([u, v]) => [SLICE_AT[0] + u * SLICE_SCALE, SLICE_AT[1] - v * SLICE_SCALE];
  const outline = profile.map(toWorld);
  const crumbLocal = inset(profile, CRUST);

  const P = k.fitProjection(
    [...k.boxCorners(BOARD, -BOARD_H - FOOT_H, 0), [JAR[0], JAR[1], 31], ...outline.map(([x, y]) => [x, y, SLICE_H])],
    WIDTH,
    HEIGHT,
    { pad: 22, azimuth: 62, elevation: 52 },
  );
  const at = (point) => k.iso(point, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const onFace = (local, z = SLICE_H) => at([...toWorld(local), z]);
  const facePath = (ring) => k.pathOf(ring.map((point) => onFace(point)), true);
  const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  const fill = (d, className) => `<path class="${className}" d="${d}"/>`;
  const rand = random(11);

  // Board: feet, slab, juice groove, grain that ends on the groove, a hang hole and the maker's mark.
  const board = [`<path class="iso-halo" d="${k.haloOf(BOARD, -BOARD_H - FOOT_H, BOARD_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BOARD, 18))) board.push(S(k.cylinder(x, y, 5, -BOARD_H - FOOT_H, FOOT_H, P, 24), { tone: "lo", className: "bb-foot" }));
  board.push(S(k.slabOf(BOARD, -BOARD_H, BOARD_H, P, 8, 1.2), { tone: "mid", className: "bb-board" }));
  const groove = k.insetPlan(BOARD, 7);
  const field = k.insetPlan(BOARD, 8.6);
  const grain = [];
  for (let y = field.y + 5; y < field.y + field.d - 4; y += 6 + rand() * 6) {
    const amp = 0.5 + rand() * 1.1, phase = rand() * 6, waves = 1 + rand() * 2;
    grain.push(k.onTop(Array.from({ length: 33 }, (_, i) => {
      const t = i / 32;
      return [field.x + field.w * t, y + amp * Math.sin(phase + t * Math.PI * waves) * Math.sin(Math.PI * t)];
    }), 0, P));
  }
  board.push(L(grain.join(""), { tone: "faint" }));
  board.push(L(k.planOutline(groove, 0, P), { tone: "lo" }), L(k.planOutline(field, 0, P), { tone: "lo" }));
  const hole = [BOARD.x + BOARD.w - 17, 44];
  board.push(fill(k.ring(hole[0], hole[1], 4.2, 0, P, 28), "bb-hole-through"), L(k.ring(hole[0], hole[1], 4.2, 0, P, 28), { tone: "mid" }));
  board.push(k.faceTextSvg(k.topMatrix([30, BOARD.y + BOARD.d - 13], 0, P, "x"), "breakup bread", { size: 4.6, tone: "lo" }));

  // Jam jar, back right: glass full of jam, a paper label with three rules, a knurled lid.
  const [jx, jy] = JAR;
  const jar = [`<path class="iso-halo" d="${k.haloOf({ x: jx - JAR_R, y: jy - JAR_R, w: JAR_R * 2, d: JAR_R * 2, r: JAR_R }, 0, 0.1, P)}" style="filter:blur(5px)"/>`];
  jar.push(S(k.cylinder(jx, jy, JAR_R, 0, 24, P, 48, 0.6), { tone: "mid", className: "bb-jar" }));
  jar.push(S(k.cylinder(jx, jy, JAR_R + 0.3, 6, 11, P, 48), { tone: "lo", crease: "none", className: "bb-label" }));
  jar.push(L([9, 11.5, 14].map((z) => k.sideArc(jx, jy, JAR_R + 0.3, z, P, 32)).join(""), { tone: "lo" }));
  jar.push(S(k.cylinder(jx, jy, JAR_R + 0.8, 24, 6, P, 48, 0.5), { tone: "mid", className: "bb-lid" }));
  jar.push(L(k.knurl(jx, jy, JAR_R + 0.8, 24.6, 29.4, 72, P, 0.3), { tone: "lo" }));
  jar.push(L(k.ring(jx, jy, JAR_R - 2, 30, P, 48), { tone: "lo" }));

  // The slice: crust walls and band, the open crumb, then the jam and cream swirl clipped to the crumb.
  const slice = [`<path class="iso-halo" d="${k.extrude(outline, 0, 0.1, P).fill}" style="filter:blur(4px)"/>`];
  slice.push(S(k.extrude(outline, 0, SLICE_H, P, { convex: true, bevel: 0.8 }), { tone: "mid", crease: "lo", className: "bb-crust" }));
  slice.push(fill(facePath(crumbLocal), "bb-crumb"));
  const crumbFor = (by) => inset(profile, CRUST + by);
  const holes = [];
  const holeField = crumbFor(1.5);
  while (holes.length < 80) {
    const point = [-58 + rand() * 116, rand() * 101];
    if (!inside(point, holeField)) continue;
    const r = 0.6 + rand() ** 2 * 2.2;
    holes.push(k.onTop(k.circleRing(...toWorld(point), r, 12), SLICE_H, P, true));
  }
  slice.push(fill(holes.join(""), "bb-hole"));
  const clip = "bb-crumb-strawberry";
  const jamLine = swirl(0.7, Math.PI * 4.5, 21, 0);
  const creamLine = swirl(0.9, Math.PI * 4.5, 21, 6.6);
  const jam = ribbon(jamLine, (t) => 7.4 * (0.82 + 0.3 * Math.sin(t * 23 + 1)) * smooth(0, 0.06, t));
  const cream = ribbon(creamLine, (t) => 4.8 * (0.78 + 0.35 * Math.sin(t * 17 + 2)) * smooth(0, 0.08, t));
  slice.push(`<defs><clipPath id="${clip}"><path d="${facePath(crumbLocal)}"/></clipPath></defs>`);
  slice.push(`<g clip-path="url(#${clip})">${fill(facePath(cream), "bb-cream")}${fill(facePath(jam), "bb-jam")}${fill(facePath(ribbon(jamLine, (t) => 1.6 * smooth(0, 0.1, t))), "bb-jam-shine")}</g>`);
  slice.push(L(facePath(crumbLocal), { tone: "lo" }));

  // Butter knife, front left, with a dab of jam on the blade.
  const knife = [];
  knife.push(S(k.slabOf({ x: -70, y: 58, w: 52, d: 7, r: 3.4 }, 0, 0.9, P, 6), { tone: "mid", crease: "none", className: "bb-steel" }));
  knife.push(fill(k.ring(-61, 61.5, 3, 0.9, P, 20), "bb-jam"));
  knife.push(S(k.slabOf({ x: -18.5, y: 57.2, w: 4, d: 8.6, r: 1.4 }, 0, 3.4, P, 4, 0.3), { tone: "mid", className: "bb-steel" }));
  knife.push(S(k.slabOf({ x: -14.5, y: 57.6, w: 36, d: 7.8, r: 3.6 }, 0, 4.4, P, 6, 0.5), { tone: "mid", className: "bb-handle" }));
  knife.push(k.dotsSvg([-7, 3.5, 14].map((x) => at([x, 61.5, 4.4])), { size: 0.9, tone: "hi" }));

  // Crumbs on the board.
  const crumbs = [];
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? [-66 + rand() * 30, 53 + rand() * 4] : [52 + rand() * 12, 6 + rand() * 30];
    crumbs.push(k.onTop(k.circleRing(side[0], side[1], 0.6 + rand() * 0.9, 8), 0, P, true));
  }

  // Callouts: a terminal dot on the part, a straight leader to the rule under its words.
  const crustAnchor = (() => {
    const band = inset(profile, CRUST / 2).filter(([, v]) => v > 70);
    return onFace(band.reduce((best, p) => (Math.abs(p[0] + 30) < Math.abs(best[0] + 30) ? p : best)));
  })();
  const pick = (line, score, margin) => {
    const safe = crumbFor(margin);
    return line.filter((p) => inside(p, safe)).map((p) => onFace(p)).reduce((best, p) => (score(p) > score(best) ? p : best));
  };
  const jamAnchor = pick(jamLine, ([x, y]) => x - y * 0.6, 3);
  const creamAnchor = pick(creamLine, ([x, y]) => -x + y * 0.8, 3);
  const callout = ({ anchor, lines, x, y, end = false, below = false }) => {
    const size = 19, lead = 22, width = Math.max(...lines.map((line) => line.length)) * size * 0.5;
    const left = end ? x - width : x;
    const ruleY = below ? y - size - 6 : y + (lines.length - 1) * lead + 12;
    const from = Math.min(left, anchor[0]), to = Math.max(left + width, anchor[0]);
    const text = lines.map((line, i) => `<tspan x="${x}" y="${y + i * lead}"${i ? ' class="sub"' : ""}>${line}</tspan>`).join("");
    return [
      `<path class="iso-line bb-leader" d="M${from.toFixed(1)} ${ruleY.toFixed(1)}H${to.toFixed(1)}"/>`,
      k.wireSvg(anchor, [anchor[0], ruleY], { tone: "hi", ends: "from", size: 2.6 }),
      `<text class="bb-callout" text-anchor="${end ? "end" : "start"}">${text}</text>`,
    ].join("");
  };
  const callouts = [
    callout({ anchor: crustAnchor, lines: ["organic sourdough"], x: 20, y: 52 }),
    callout({ anchor: jamAnchor, lines: ["strawberry jam,", "from real fruit"], x: 380, y: 46, end: true }),
    callout({ anchor: creamAnchor, lines: ["sweet cream"], x: 20, y: 468, below: true }),
  ];

  return k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    className: "anatomy-svg",
    label:
      "Anatomy of a strawberry shortcake slice on a cutting board: organic sourdough crust and crumb, a swirl of strawberry jam made from real fruit, and a ribbon of sweet cream. A jar of jam and a butter knife sit beside it.",
    body: [board.join(""), jar.join(""), slice.join(""), crumbs.length ? fill(crumbs.join(""), "bb-crumbs") : "", knife.join(""), callouts.join("")],
  });
}

const figures = { strawberry };
let page = readFileSync(PAGE, "utf8");
for (const [name, build] of Object.entries(figures)) {
  const marker = new RegExp(`(<!-- anatomy:${name} -->)[\\s\\S]*?(<!-- /anatomy:${name} -->)`);
  if (!marker.test(page)) throw new Error(`index.html has no <!-- anatomy:${name} --> markers`);
  page = page.replace(marker, (_, open, close) => `${open}${build()}${close}`);
  console.log("built", name);
}
writeFileSync(PAGE, page);

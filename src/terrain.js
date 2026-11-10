// Procedural terrain for the open world: deterministic noise, biomes (warped Voronoi around region
// centers), flattened points of interest and a baked heightmap for fast ground queries.

export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// 2D simplex noise (Gustavson), seeded permutation
const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const perm = new Uint8Array(512);
{ const r = rng(1337), p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = r() * (i + 1) | 0; [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const F2 = .5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
export function noise(x, y) {
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2;
  const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  for (const [dx, dy, a, b] of [[x0, y0, 0, 0], [x1, y1, i1, j1], [x2, y2, 1, 1]]) {
    let tt = .5 - dx * dx - dy * dy;
    if (tt > 0) { const g = G[perm[ii + a + perm[jj + b]] & 7]; tt *= tt; n += tt * tt * (g[0] * dx + g[1] * dy); }
  }
  return 70 * n;
}
export const fbm = (x, y, o = 4) => { let a = 0, f = 1, amp = 1, t = 0; for (let i = 0; i < o; i++) { a += noise(x * f, y * f) * amp; t += amp; f *= 2.03; amp *= .5; } return a / t; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const W = 190;            // half size of the world square
export const PLAY = W - 26;      // walkable half size (mountains beyond)
export const WATER = -.85;

export const BIOMES = {
  grove: { name: 'Bosque da Lua', center: [0, 0], tier: 1, grass: [0x2c4a52, 0x3d6a6a], ground: 0x2a3a46, fog: 0x1a1430,
    props: { pine: 7, bush: 9, lantern: .6, rocks: 1.5, shrooms: 1 }, foes: ['crawler', 'wolf', 'shroom'] },
  crystal: { name: 'Campos de Cristal', center: [100, -78], tier: 2, grass: [0x3a3566, 0x5a4a8a], ground: 0x34305a, fog: 0x1d1640,
    props: { crystals: 6, rocks: 5, pine: 1.2, bush: 2 }, foes: ['wolf', 'crawler', 'spitter', 'bomber'] },
  swamp: { name: 'Pântano Fúngico', center: [118, 46], tier: 3, grass: [0x2f4a3a, 0x4a6a3a], ground: 0x283a30, fog: 0x14221c,
    props: { shrooms: 7, oldtree: 4, bush: 4, rocks: 1.5, crystals: .6, lantern: .2 }, foes: ['shroom', 'bat', 'bomber', 'spitter'] },
  forest: { name: 'Floresta Ancestral', center: [8, 124], tier: 3, grass: [0x24403c, 0x2f5a4a], ground: 0x22342e, fog: 0x0f1c1a,
    props: { oldtree: 5, pine: 7, bush: 4, rocks: 1.5, shrooms: 1.5 }, foes: ['wolf', 'golem', 'bat', 'crawler'], boss: 'treant' },
  ruins: { name: 'Ruínas Lunares', center: [-118, 12], tier: 4, grass: [0x3e3a50, 0x55506a], ground: 0x3a3646, fog: 0x1c1628,
    props: { pillar: 4, arch: .9, rocks: 3, bush: 3, oldtree: 2, lantern: .7, pine: 1 }, foes: ['archer', 'shaman', 'wraith', 'golem'], boss: 'boss1' },
  castle: { name: 'Cidadela Sem Lua', center: [-6, -128], tier: 5, grass: [0x2e2a3e, 0x403a56], ground: 0x2a2636, fog: 0x120e1e,
    props: { tower: .35, pillar: 4, arch: .8, rocks: 4, crystals: 1.5, lantern: 1, oldtree: 1 }, foes: ['brute', 'wraith', 'archer', 'shaman'], boss: 'boss2' },
  highlands: { name: 'Planalto Uivante', center: [-100, -92], tier: 4, grass: [0x34404e, 0x4a5a66], ground: 0x303a46, fog: 0x161a2a,
    props: { rocks: 6, pine: 3, crystals: 1.5, bush: 2 }, foes: ['bat', 'brute', 'wolf', 'archer'] },
};
const BIOME_KEYS = Object.keys(BIOMES);

/** biome id at a position: nearest region center after warping coordinates with noise */
export function biomeAt(x, z) {
  const wx = x + fbm(x * .012, z * .012, 3) * 26, wz = z + fbm(x * .012 + 40, z * .012 - 17, 3) * 26;
  let best = 'grove', bd = Infinity;
  for (const k of BIOME_KEYS) {
    const [cx, cz] = BIOMES[k].center, d = (wx - cx) ** 2 + (wz - cz) ** 2 * (k === 'grove' ? 1 : 1);
    const dd = k === 'grove' ? d * 1.6 : d;
    if (dd < bd) { bd = dd; best = k; }
  }
  return best;
}

function rawHeight(x, z) {
  let h = fbm(x * .006, z * .006, 4) * 9 + fbm(x * .025, z * .025, 3) * 1.8;
  const b = biomeAt(x, z);
  if (b === 'highlands') h += 6 + fbm(x * .02, z * .02, 2) * 4;
  if (b === 'castle') h += 3;
  const e = Math.max(Math.abs(x), Math.abs(z)) / W;
  h += Math.pow(smooth(.8, 1.02, e), 1.4) * (42 + fbm(x * .03, z * .03, 3) * 14);
  // swamp basin with a lake
  const [sx, sz] = BIOMES.swamp.center, sd = Math.hypot(x - sx - 6, z - sz + 4);
  h -= smooth(34, 8, sd) * 4.2;
  return h;
}

/** Build the world layout (points of interest) and bake the heightmap. */
export function buildTerrain(seed = 7) {
  const r = rng(seed);
  const pois = [];   // {x,z,r,kind,biome}
  const far = (x, z, d) => pois.every(p => Math.hypot(p.x - x, p.z - z) > d + p.r * .5);
  // spawn shrine
  pois.push({ x: 0, z: 6, r: 10, kind: 'shrine', biome: 'grove', spawn: true });
  // boss lairs
  for (const k of BIOME_KEYS) { const B = BIOMES[k]; if (B.boss) { const [cx, cz] = B.center; pois.push({ x: cx * 1.08, z: cz * 1.08, r: 22, kind: 'lair', biome: k, boss: B.boss }); } }
  // one shrine per region near the side facing the center
  for (const k of BIOME_KEYS) {
    if (k === 'grove') continue;
    const [cx, cz] = BIOMES[k].center, l = Math.hypot(cx, cz);
    pois.push({ x: cx - cx / l * 34, z: cz - cz / l * 34, r: 9, kind: 'shrine', biome: k });
  }
  // camps
  let tries = 0;
  while (pois.filter(p => p.kind === 'camp').length < 34 && tries++ < 4000) {
    const x = (r() * 2 - 1) * (PLAY - 12), z = (r() * 2 - 1) * (PLAY - 12);
    if (Math.hypot(x, z) < 26) continue;
    if (!far(x, z, 30)) continue;
    pois.push({ x, z, r: 11, kind: 'camp', biome: biomeAt(x, z) });
  }
  // flatten every point of interest toward its center height
  for (const p of pois) p.h = Math.max(rawHeight(p.x, p.z), WATER + .6);
  const height = (x, z) => {
    let h = rawHeight(x, z);
    for (const p of pois) {
      const d = Math.hypot(x - p.x, z - p.z), R = p.r + 8;
      if (d < R) h += (p.h - h) * smooth(R, p.r * .6, d);
    }
    return h;
  };
  // bake at 1m
  const N = W * 2 + 1, hm = new Float32Array(N * N), bm = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i - W, z = j - W;
    hm[j * N + i] = height(x, z);
    bm[j * N + i] = BIOME_KEYS.indexOf(biomeAt(x, z));
  }
  const at = (x, z) => {
    const fx = Math.min(N - 1.001, Math.max(0, x + W)), fz = Math.min(N - 1.001, Math.max(0, z + W));
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, o = j * N + i;
    return (hm[o] * (1 - u) + hm[o + 1] * u) * (1 - v) + (hm[o + N] * (1 - u) + hm[o + N + 1] * u) * v;
  };
  const biome = (x, z) => BIOME_KEYS[bm[Math.min(N - 1, Math.max(0, Math.round(z + W))) * N + Math.min(N - 1, Math.max(0, Math.round(x + W)))]];
  return { pois, hm, bm, N, height: at, biome, rng: r };
}

export { BIOME_KEYS };

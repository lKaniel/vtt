import * as THREE from 'three';
import type { Tone } from '../feedback.ts';
import { arcOf, boltPath, easeOut, type Flight, flightAt, lerp3, numberAt, type V3 } from './fx3d-motion.ts';

// The pieces the 3D view's attacks and spells are made of (effects3d.ts):
// glowing orbs and arrows that fly, crackling bolts, sweeping slashes,
// blasts, sprays of sparks, and numbers over heads. Each owns its three.js
// object and moves itself from the time since it started. Points are map
// pixels with a height, [x, y, h]; three.js has y up.

export interface Piece {
  readonly object: THREE.Object3D;
  /** Moves the piece `ms` after it started; false once it is over. */
  update(ms: number): boolean;
  dispose(): void;
}

const v3 = (p: V3) => new THREE.Vector3(p[0], p[2], p[1]);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

let dotTexture: THREE.Texture | undefined;

/** A soft round glow, white in the middle (drawn once). */
function softDot(): THREE.Texture {
  if (dotTexture) return dotTexture;
  // Off a page (the tests) there is nothing to draw on: a plain white dot.
  if (typeof document === 'undefined') {
    dotTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    return dotTexture;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

/** Light that adds up, as fire and magic glow; no depth written, so pieces never hide each other. */
const glowing = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false } as const;

/** A swarm of glowing motes in one draw: each placed and faded (to black, which adds nothing) by `move`. */
class Motes {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private color: THREE.Color;

  constructor(
    readonly n: number,
    color: number,
    size: number,
  ) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const material = new THREE.PointsMaterial({ ...glowing, size, map: softDot(), vertexColors: true });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.color = new THREE.Color(color);
  }

  move(each: (i: number) => { at: V3; fade: number } | undefined): void {
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.n; i++) {
      const m = each(i);
      const fade = m ? clamp01(m.fade) : 0;
      if (m) pos.setXYZ(i, m.at[0], m.at[2], m.at[1]);
      col.setXYZ(i, this.color.r * fade, this.color.g * fade, this.color.b * fade);
    }
    pos.needsUpdate = col.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

/** Random headings and speeds for motes. */
const scatter = (n: number) =>
  Array.from({ length: n }, () => ({
    yaw: Math.random() * Math.PI * 2,
    up: Math.random(),
    speed: 0.55 + Math.random() * 0.45,
    delay: Math.random() * 0.35,
  }));

function sprite(color: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ ...glowing, map: softDot(), color }));
  s.scale.set(size, size, 1);
  return s;
}

/** A glowing orb flying with a trail of light behind it. */
function orb(from: V3, to: V3, { color, duration }: { color: number; duration: number }): Piece {
  const group = new THREE.Group();
  const halo = sprite(color, 70);
  const core = sprite(0xffffff, 26);
  const trail = new Motes(14, color, 70);
  group.add(halo, core, trail.points);
  const arc = arcOf(from, to, 'orb');
  return {
    object: group,
    update(ms) {
      const t = ms / duration;
      if (t >= 1) return false;
      const head = v3(flightAt(from, to, t, arc));
      halo.position.copy(head);
      core.position.copy(head);
      trail.move((i) => ({ at: flightAt(from, to, Math.max(0, t - i * 0.018), arc), fade: 1 - i / 14 }));
      return true;
    },
    dispose() {
      halo.material.dispose();
      core.material.dispose();
      trail.dispose();
    },
  };
}

/** An arrow (or bolt, stone, dart) lobbed from bow to target, a faint streak behind it. */
function arrow(from: V3, to: V3, { color, duration }: { color: number; duration: number }): Piece {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 56, 5).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x6b4a2b }),
  );
  const tip = sprite(0xffffff, 14);
  const streak = new Motes(10, color, 36);
  group.add(shaft, tip, streak.points);
  const arc = arcOf(from, to, 'arrow');
  return {
    object: group,
    update(ms) {
      const t = ms / duration;
      if (t >= 1) return false;
      const here = v3(flightAt(from, to, t, arc));
      const ahead = v3(flightAt(from, to, Math.min(1, t + 0.02), arc));
      shaft.position.copy(here);
      if (ahead.distanceToSquared(here) > 0) shaft.lookAt(ahead);
      tip.position.copy(ahead);
      streak.move((i) => ({ at: flightAt(from, to, Math.max(0, t - i * 0.02), arc), fade: 0.6 * (1 - i / 10) }));
      return true;
    },
    dispose() {
      shaft.geometry.dispose();
      shaft.material.dispose();
      tip.material.dispose();
      streak.dispose();
    },
  };
}

/** A crackling bolt that strikes along its whole length, flickers and fades. */
function bolt(from: V3, to: V3, { color, duration }: { color: number; duration: number }): Piece {
  const group = new THREE.Group();
  const inner = new THREE.MeshBasicMaterial({ ...glowing, color: 0xffffff });
  const outer = new THREE.MeshBasicMaterial({ ...glowing, color, opacity: 0.35 });
  let meshes: THREE.Mesh[] = [];
  let shaped = -Infinity;
  const reshape = (end: V3) => {
    for (const m of meshes) m.geometry.dispose();
    group.clear();
    const path = new THREE.CurvePath<THREE.Vector3>();
    const pts = boltPath(from, end, 9).map(v3);
    pts.slice(1).forEach((p, i) => path.add(new THREE.LineCurve3(pts[i], p)));
    meshes = [
      new THREE.Mesh(new THREE.TubeGeometry(path, 36, 2.5, 4), inner),
      new THREE.Mesh(new THREE.TubeGeometry(path, 36, 10, 5), outer),
    ];
    group.add(...meshes);
  };
  return {
    object: group,
    update(ms) {
      const t = ms / duration;
      if (t >= 1) return false;
      if (ms - shaped > 60) {
        reshape(lerp3(from, to, clamp01(t * 3)));
        shaped = ms;
      }
      const fade = 1 - clamp01((t - 0.6) / 0.4);
      inner.opacity = fade;
      outer.opacity = 0.35 * fade;
      return true;
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      inner.dispose();
      outer.dispose();
    },
  };
}

/** A missile of the given flight. */
export function missile3d(flight: Flight, from: V3, to: V3, look: { color: number; duration: number }): Piece {
  if (flight === 'bolt') return bolt(from, to, look);
  return flight === 'arrow' ? arrow(from, to, look) : orb(from, to, look);
}

/** A bright crescent sweeping across the target, swung from the attacker's side. */
export function slash(at: V3, attacker: V3, r: number, color: number): Piece {
  const SWEEP = 2.4;
  const DURATION = 320;
  const geometry = new THREE.RingGeometry(r * 0.6, r * 1.1, 28, 1, 0, SWEEP);
  const material = new THREE.MeshBasicMaterial({ ...glowing, color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const pivot = new THREE.Group();
  pivot.add(mesh);
  pivot.position.copy(v3(at));
  // The ring stands facing the attacker, tipped over for a diagonal cut.
  pivot.lookAt(v3([attacker[0], attacker[1], at[2]]));
  mesh.rotation.z = -Math.PI / 4 - SWEEP / 2;
  return {
    object: pivot,
    update(ms) {
      const t = ms / DURATION;
      if (t >= 1) return false;
      mesh.rotation.z = -Math.PI / 4 - SWEEP / 2 + (t - 0.5) * 1.6;
      material.opacity = Math.sin(Math.PI * t);
      return true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** A ball of light swelling to `radius` from a point on the ground, a ring along the ground and sparks thrown out. */
export function blast(at: V3, radius: number, color: number): Piece {
  const DURATION = 700;
  const group = new THREE.Group();
  const ballGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ ...glowing, color, side: THREE.DoubleSide }));
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ ...glowing, color, side: THREE.DoubleSide }));
  const sparks = new Motes(48, color, Math.max(40, radius / 5));
  const how = scatter(48);
  const flash = sprite(0xffffff, 1);
  flash.position.y = radius * 0.3;
  group.add(ball, ring, flash, sparks.points);
  group.position.copy(v3(at));
  return {
    object: group,
    update(ms) {
      const t = ms / DURATION;
      if (t >= 1) return false;
      const grow = easeOut(clamp01(t * 2.2));
      const fade = 1 - clamp01((t - 0.25) / 0.75);
      ball.scale.setScalar(Math.max(1, radius * grow));
      ball.material.opacity = 0.22 * fade;
      ring.scale.setScalar(Math.max(1, radius * grow));
      ring.material.opacity = 0.9 * fade;
      const blaze = radius * 1.4 * easeOut(clamp01(t * 4));
      flash.scale.set(blaze, blaze, 1);
      flash.material.opacity = 1 - clamp01(t * 2.5);
      sparks.move((i) => {
        const m = how[i]!;
        const d = radius * m.speed * easeOut(clamp01(t * 1.4));
        const h = radius * 0.6 * m.up * Math.sin(Math.PI * clamp01(t * 1.2));
        return { at: [Math.cos(m.yaw) * d, Math.sin(m.yaw) * d, h], fade };
      });
      return true;
    },
    dispose() {
      ballGeo.dispose();
      ringGeo.dispose();
      ball.material.dispose();
      ring.material.dispose();
      flash.material.dispose();
      sparks.dispose();
    },
  };
}

/** A swarm of motes alone, each placed `t` of the way through by `place` (undefined: not shown). */
function swarm<M>(
  how: readonly M[],
  look: { color: number; size: number; duration: number },
  place: (m: M, t: number) => { at: V3; fade: number } | undefined,
): Piece {
  const motes = new Motes(how.length, look.color, look.size);
  return {
    object: motes.points,
    update(ms) {
      const t = ms / look.duration;
      if (t >= 1) return false;
      motes.move((i) => place(how[i]!, t));
      return true;
    },
    dispose: () => motes.dispose(),
  };
}

/** Sparks of a blow flying off a struck creature's chest and falling. */
export function sparks(at: V3, r: number, color: number): Piece {
  return swarm(scatter(22), { color, size: Math.max(24, r * 0.5), duration: 520 }, (m, t) => {
    const d = r * 1.6 * m.speed * easeOut(t);
    const h = at[2] + r * (m.up - 0.2) * 1.5 * t - r * 2 * t * t;
    return { at: [at[0] + Math.cos(m.yaw) * d, at[1] + Math.sin(m.yaw) * d, h], fade: 1 - t };
  });
}

/** A cone or line of sparks streaming from the caster's chest along `toward` (a unit vector on the map). */
export function stream(
  from: V3,
  toward: [number, number],
  { length, wide, color }: { length: number; wide: boolean; color: number },
): Piece {
  const spread = wide ? 1.0 : 0.08;
  const facing = Math.atan2(toward[1], toward[0]);
  const how = scatter(wide ? 90 : 60).map((m) => ({
    ...m,
    yaw: facing + (Math.random() - 0.5) * spread,
    lift: Math.random() - 0.5,
  }));
  return swarm(how, { color, size: wide ? 120 : 80, duration: 700 }, (m, t) => {
    const local = clamp01((t - m.delay) / 0.6);
    if (local <= 0 || local >= 1) return undefined;
    const d = length * m.speed * easeOut(local);
    const h = from[2] + m.lift * d * spread * 0.8 - from[2] * 0.5 * local;
    return { at: [from[0] + Math.cos(m.yaw) * d, from[1] + Math.sin(m.yaw) * d, h], fade: 1 - local };
  });
}

/** Light gathering round a creature's feet and climbing it: a caster channelling, or healing settling (`rising`). */
export function aura(feet: V3, r: number, { color, rising }: { color: number; rising: boolean }): Piece {
  const DURATION = rising ? 900 : 560;
  const group = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(r * 1.2, Math.max(1.5, r * 0.04), 6, 40).rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ ...glowing, color }));
  const motes = new Motes(26, color, Math.max(24, r * 0.5));
  const how = scatter(26);
  group.add(ring, motes.points);
  group.position.copy(v3(feet));
  return {
    object: group,
    update(ms) {
      const t = ms / DURATION;
      if (t >= 1) return false;
      const fade = Math.sin(Math.PI * t);
      ring.material.opacity = fade;
      ring.position.y = rising ? r * 1.8 * t : r * 0.2;
      motes.move((i) => {
        const m = how[i]!;
        const local = clamp01((t - m.delay) / 0.65);
        const spin = m.yaw + (rising ? 0 : t * 5);
        const d = r * (rising ? 0.9 * m.speed : 1.5 - t * 0.9);
        const h = rising ? local * r * 2.6 * m.speed : r * (0.2 + 1.6 * t * m.up);
        return { at: [Math.cos(spin) * d, Math.sin(spin) * d, h], fade: Math.sin(Math.PI * local) };
      });
      return true;
    },
    dispose() {
      ringGeo.dispose();
      ring.material.dispose();
      motes.dispose();
    },
  };
}

const TONES: Record<Tone, { fill: string; stroke: string; size: number }> = {
  damage: { fill: '#fff1d6', stroke: '#6a1208', size: 1 },
  crit: { fill: '#ffc94a', stroke: '#6a2400', size: 1.35 },
  heal: { fill: '#9cf5aa', stroke: '#0d3a16', size: 1 },
  miss: { fill: '#d8d0c0', stroke: '#1a1a1a', size: 0.75 },
  note: { fill: '#d9c8ff', stroke: '#241640', size: 0.65 },
};

/** A word or number drawn on a canvas, for a sprite. */
function lettering(text: string, tone: Tone): { texture: THREE.Texture; aspect: number } {
  const style = TONES[tone];
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '96px "IM Fell English SC", Georgia, serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = w;
  c.height = 128;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = style.stroke;
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 8;
  g.strokeText(text, w / 2, 64);
  g.shadowBlur = 0;
  g.fillStyle = style.fill;
  g.fillText(text, w / 2, 64);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: w / 128 };
}

/** How tall a damage number stands on screen: a share of the view's height. */
const NUMBER_HEIGHT = 0.1;

/** A number popping up over a creature's head and drifting up, the same size however far the camera is. */
export function number3d(head: V3, text: string, tone: Tone, rise: number): Piece {
  const DURATION = tone === 'crit' ? 1500 : 1150;
  const { texture, aspect } = lettering(tone === 'crit' ? `${text}!` : text, tone);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: false,
  });
  const label = new THREE.Sprite(material);
  label.center.set(0.5, 0);
  label.renderOrder = 10;
  const drift = (Math.random() - 0.5) * rise * 0.4;
  return {
    object: label,
    update(ms) {
      const t = ms / DURATION;
      if (t >= 1) return false;
      const m = numberAt(t);
      const h = NUMBER_HEIGHT * TONES[tone].size * m.scale;
      label.scale.set(h * aspect, h, 1);
      label.position.copy(v3([head[0] + drift * t, head[1], head[2] + rise * m.rise]));
      material.opacity = m.alpha;
      return true;
    },
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

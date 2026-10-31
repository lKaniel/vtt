import { currentTurn, type Health, type Point, type TokenView } from '@vtt/shared';
import { Assets, Container, Graphics, Sprite as PixiSprite, Text, type Texture } from 'pixi.js';
import { BarTween } from '../bar-tween.ts';
import { portraitOf, tokenBaseArt } from '../icon-art.ts';
import type { Session } from '../session.ts';
import type { Viewer } from './Vision.ts';

/** Token walking speed when animating a move, pixels per second. */
const WALK_SPEED = 900;
/** Token disc radius as a share of its size in pixels. */
const DISC = 0.42;
/** Ring around the token whose turn it is. */
const TURN_COLOR = '#e8c070';
/** Painted base ring diameter as a multiple of the disc radius. */
const BASE = 2.85;
/** Rims of party members and of everyone else. */
const ALLY_RIM = '#a88a5e';
const OTHER_RIM = '#5a2620';
/** A flinch: how long the flash and shake last (ms) and how far it shakes (share of the radius). */
const FLINCH_MS = 320;
const SHAKE = 0.12;
/** A lunge toward the target and back, ms, and how far (share of the radius). */
const LUNGE_MS = 260;
const LUNGE = 0.6;

interface Sprite {
  root: Container;
  /** The painted ring under the disc. */
  base: PixiSprite;
  /** The token's picture, cut to a circle inside the rim. */
  face: PixiSprite;
  faceMask: Graphics;
  disc: Graphics;
  /** Hit point bar and markers drawn over the disc. */
  status: Graphics;
  label: Text;
  /** Remaining points of an animated move. */
  route: Point[];
  token: TokenView;
  r: number;
  bar?: BarTween;
  /** Flinch start time and colour, lunge start time and direction. */
  flinch?: { at: number; color: number };
  lunge?: { at: number; dir: Point };
}

/** Draws tokens and animates them along the paths they walk. */
export class TokenLayer {
  readonly container = new Container();
  private views = new Map<string, Sprite>();
  private labelsVisible = true;
  private lastClick = { id: '', at: 0 };
  /** Called when a token you control is pressed, so the map can let you drag it somewhere. */
  onGrab?: (id: string, at: Point) => void;

  constructor(private session: Session) {}

  draw(token: TokenView): void {
    const view = this.views.get(token.id) ?? this.create(token);
    if (view.route.length === 0) view.root.position.set(token.x, token.y);
    const r = token.size * (this.session.world?.gridSize ?? 100) * DISC;
    view.token = token;
    view.r = r;
    trackHp(view, token);
    showTexture(view.base, tokenBaseArt(token, this.session.selected === token.id), r * BASE);
    drawDisc(view.disc.clear(), token, r, this.ringColor(token));
    view.faceMask
      .clear()
      .circle(0, 0, r - 2)
      .fill(0xffffff);
    showTexture(view.face, portraitOf(token), r * 2);
    redrawStatus(view);
    const notes = [token.hidden && 'hidden', token.visibleTo && 'illusion'].filter(Boolean);
    view.label.text = notes.length ? `${token.name} (${notes.join(', ')})` : token.name;
    view.label.position.set(0, r + 4);
    view.label.visible = this.labelsVisible;
    view.root.alpha = token.hidden ? 0.5 : 1;
    view.root.cursor = this.isTarget(token) ? 'crosshair' : 'pointer';
  }

  redrawAll(): void {
    for (const t of this.session.tokens.values()) this.draw(t);
  }

  remove(id: string): void {
    this.views.get(id)?.root.destroy({ children: true });
    this.views.delete(id);
  }

  walk(id: string, path: Point[]): void {
    const view = this.views.get(id);
    if (view) view.route = path.slice(1);
  }

  showLabels(visible: boolean): void {
    this.labelsVisible = visible;
    for (const v of this.views.values()) v.label.visible = visible;
  }

  /** Your tokens, which see for you, where they're drawn right now. The GM has none. */
  viewers(): Viewer[] {
    const you = this.session.you;
    if (!you || you.role === 'gm') return [];
    const out: Viewer[] = [];
    for (const t of this.session.tokens.values()) {
      const view = this.views.get(t.id);
      if (view && t.controllers.includes(you.id)) out.push({ token: t, at: [view.root.x, view.root.y] });
    }
    return out;
  }

  /** Moves walking tokens along their routes; true while any token is walking. */
  animate(dt: number): boolean {
    let walking = false;
    for (const v of this.views.values()) {
      if (v.route.length === 0) continue;
      walking = true;
      step(v, WALK_SPEED * dt);
    }
    return walking;
  }

  /** Where a token is drawn right now, and its disc radius. */
  placeOf(id: string): { at: Point; r: number } | undefined {
    const v = this.views.get(id);
    return v && { at: [v.root.x, v.root.y], r: v.r };
  }

  /** The blow landed: flash and shake, and let the hit point bar move. */
  flinch(id: string, color: number, now: number): void {
    const v = this.views.get(id);
    if (!v) return;
    v.flinch = { at: now, color };
    this.release(id, now);
  }

  /** Lets a waiting hit point bar move (healing or damage with no flinch). */
  release(id: string, now: number): void {
    this.views.get(id)?.bar?.release(now);
  }

  /** Steps toward `toward` and back. */
  lunge(id: string, toward: string, now: number): void {
    const v = this.views.get(id);
    const t = this.views.get(toward);
    if (!v || !t) return;
    const dx = t.root.x - v.root.x;
    const dy = t.root.y - v.root.y;
    const d = Math.hypot(dx, dy) || 1;
    v.lunge = { at: now, dir: [dx / d, dy / d] };
  }

  /** Hit point bars, flinches and lunges; true while any is playing. */
  animateFeedback(now: number): boolean {
    let busy = false;
    for (const v of this.views.values()) {
      if (v.bar?.step(now)) {
        redrawStatus(v);
        busy = true;
      }
      busy = moveBody(v, now) || busy;
    }
    return busy;
  }

  /** Clicking this token would fire the armed attack, or pick it for the aimed spell. */
  /** True for the second click on the same token in quick succession. */
  private isDoubleClick(id: string): boolean {
    const now = performance.now();
    const double = this.lastClick.id === id && now - this.lastClick.at < DOUBLE_CLICK_MS;
    this.lastClick = { id, at: double ? 0 : now };
    return double;
  }

  private isTarget(token: TokenView): boolean {
    if (this.session.aiming?.mode === 'creatures') return true;
    return !!this.session.armed && this.session.selected !== token.id;
  }

  private ringColor(token: TokenView): string {
    const combat = this.session.combat;
    if (combat && currentTurn(combat) === token.id) return TURN_COLOR;
    const you = this.session.you;
    if (you && token.controllers.includes(you.id)) return you.color;
    return token.controllers.length > 0 ? ALLY_RIM : OTHER_RIM;
  }

  private create(token: TokenView): Sprite {
    const root = new Container();
    const base = new PixiSprite();
    base.anchor.set(0.5);
    const disc = new Graphics();
    const face = new PixiSprite();
    face.anchor.set(0.5);
    const faceMask = new Graphics();
    face.mask = faceMask;
    const status = new Graphics();
    const label = new Text({
      text: '',
      style: {
        fill: 0xf2e3c0,
        fontFamily: '"IM Fell English SC", Georgia, serif',
        fontSize: 20,
        fontWeight: '400',
        stroke: { color: 0x000000, width: 5 },
      },
    });
    label.anchor.set(0.5, 0);
    root.addChild(base, disc, face, faceMask, status, label);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointerdown', (e) => {
      e.stopPropagation();
      const t = this.session.tokens.get(token.id);
      if (!t) return;
      if (this.session.aiming?.mode === 'creatures') return this.session.pickTarget(t.id);
      if (this.isTarget(t)) return this.session.attack(t.id);
      if (!this.session.canControl(t)) return;
      this.session.select(t.id);
      if (this.isDoubleClick(t.id)) this.session.openSheet({ kind: 'token', id: t.id });
      else this.onGrab?.(t.id, [e.global.x, e.global.y]);
    });
    this.container.addChild(root);
    const view: Sprite = { root, base, disc, face, faceMask, status, label, route: [], token, r: 0 };
    this.views.set(token.id, view);
    return view;
  }
}

const DOUBLE_CLICK_MS = 350;

/** Shows a picture once it has loaded; switching pictures keeps the old one until then. */
function showTexture(sprite: PixiSprite, url: string, size: number): void {
  sprite.label = url;
  void Assets.load<Texture>(url).then((texture) => {
    if (sprite.destroyed || sprite.label !== url) return;
    sprite.texture = texture;
    sprite.setSize(size);
  });
}

/** A shadow on the ground, the disc with a soft highlight, and a rim in the token's ring colour. */
function drawDisc(g: Graphics, token: TokenView, r: number, rim: string): void {
  g.ellipse(0, r * 0.12, r * 1.08, r * 1.02).fill({ color: 0x000000, alpha: 0.45 });
  g.circle(0, 0, r).fill(token.color);
  g.circle(-r * 0.22, -r * 0.25, r * 0.6).fill({ color: 0xffffff, alpha: 0.12 });
  g.circle(0, 0, r).stroke({ width: 5, color: rim });
  g.circle(0, 0, r + 3).stroke({ width: 1.5, color: 0x000000, alpha: 0.8 });
}

/** How full the hit point bar looks for tokens whose exact hit points are secret. */
const HEALTH_SHARE: Record<Health, number> = { unhurt: 1, hurt: 0.75, bloodied: 0.4, down: 0 };

function hpShare(token: TokenView): number | undefined {
  if (token.sheet) return token.sheet.maxHp ? token.sheet.hp / token.sheet.maxHp : 0;
  return token.health ? HEALTH_SHARE[token.health] : undefined;
}

/** Starts the bar for a token seen for the first time; later changes animate. */
function trackHp(view: Sprite, token: TokenView): void {
  const share = hpShare(token);
  if (share === undefined) {
    view.bar = undefined;
    return;
  }
  const value = Math.max(0, share);
  if (view.bar) view.bar.set(value, performance.now());
  else view.bar = new BarTween(value);
}

function redrawStatus(view: Sprite): void {
  drawStatus(view.status.clear(), view, view.r);
  drawEffects(view.status, view.token, view.r);
}

/** A hit point bar under the disc, with a pale trail of what was just lost, and a cross over creatures that are down. */
function drawStatus(g: Graphics, { bar }: Sprite, r: number): void {
  if (!bar) return;
  const share = bar.shown;
  const w = r * 1.6;
  const y = r * 0.55;
  g.rect(-w / 2, y, w, 10).fill({ color: 0x000000, alpha: 0.7 });
  if (bar.trail > share) g.rect(-w / 2, y, w * bar.trail, 10).fill({ color: 0xf2e3c0, alpha: 0.85 });
  g.rect(-w / 2, y, w * share, 10).fill(barColor(share));
  if (share > 0) return;
  const c = r * 0.5;
  g.moveTo(-c, -c).lineTo(c, c).moveTo(c, -c).lineTo(-c, c).stroke({ width: 8, color: 0x000000, alpha: 0.8 });
}

/** Small dots over the disc, one per effect (red for conditions), and a blue ring while concentrating. */
function drawEffects(g: Graphics, token: TokenView, r: number): void {
  const effects = token.effects ?? [];
  effects.slice(0, 6).forEach((e, i) => {
    const color = e.conditions?.length ? 0xd04a4a : 0x7ab0ff;
    g.circle(-r * 0.6 + i * r * 0.24, -r * 0.75, r * 0.1)
      .fill(color)
      .stroke({ width: 2, color: 0x000000 });
  });
  if (token.concentration) g.circle(0, 0, r * 1.12).stroke({ width: 3, color: 0x7ab0ff, alpha: 0.8 });
}

function barColor(share: number): number {
  if (share > 0.5) return 0x4caf50;
  return share > 0.25 ? 0xe0a030 : 0xd04a4a;
}

/** Flinch (red flash and shake) and lunge offsets; true while either plays. */
function moveBody(v: Sprite, now: number): boolean {
  let dx = 0;
  let dy = 0;
  const f = v.flinch && (now - v.flinch.at) / FLINCH_MS;
  if (v.flinch && f !== undefined && f < 1) {
    const amp = v.r * SHAKE * (1 - f);
    dx += Math.sin(f * 40) * amp;
    v.face.tint = mix(v.flinch.color, 0xffffff, f);
    v.disc.tint = v.face.tint;
  } else if (v.flinch) {
    v.flinch = undefined;
    v.face.tint = v.disc.tint = 0xffffff;
  }
  const l = v.lunge && (now - v.lunge.at) / LUNGE_MS;
  if (v.lunge && l !== undefined && l < 1) {
    const reach = Math.sin(l * Math.PI) * v.r * LUNGE;
    dx += v.lunge.dir[0] * reach;
    dy += v.lunge.dir[1] * reach;
  } else v.lunge = undefined;
  v.root.pivot.set(-dx, -dy);
  return !!(v.flinch ?? v.lunge);
}

/** Blends two colours, `t` of the way from `a` to `b`. */
function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const one = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return one(16) | one(8) | one(0);
}

/** Moves a token up to `distance` pixels along its route. */
function step(v: Sprite, distance: number): void {
  let budget = distance;
  while (budget > 0 && v.route.length > 0) {
    const [tx, ty] = v.route[0]!;
    const dx = tx - v.root.x;
    const dy = ty - v.root.y;
    const d = Math.hypot(dx, dy);
    if (d > budget) {
      v.root.position.set(v.root.x + (dx / d) * budget, v.root.y + (dy / d) * budget);
      return;
    }
    v.root.position.set(tx, ty);
    v.route.shift();
    budget -= d;
  }
}

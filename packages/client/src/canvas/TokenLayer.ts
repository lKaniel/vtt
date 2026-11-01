import {
  canObserve,
  currentTurn,
  hasCondition,
  isGm,
  isParty,
  ownersOf,
  type Health,
  type Point,
  type TokenView,
} from '@vtt/shared';
import {
  Assets,
  Container,
  Graphics,
  Sprite as PixiSprite,
  Text,
  type FederatedPointerEvent,
  type Texture,
} from 'pixi.js';
import { BarTween } from '../bar-tween.ts';
import { clickSelect, modsOf } from '../editor/selection.ts';
import { cutoutOf, portraitOf } from '../icon-art.ts';
import type { Session } from '../session.ts';
import type { Viewer } from './Vision.ts';

/** Token walking speed when animating a move, pixels per second. */
const WALK_SPEED = 900;
/** Token radius as a share of its size in pixels: effects, bars and the ground ring are laid out on it. */
const DISC = 0.42;
/** Ring around the token whose turn it is. */
const TURN_COLOR = '#e8c070';
/** Ground rings of party members and of everyone else, bright enough to read on any floor. */
const ALLY_RIM = '#d8c08a';
const OTHER_RIM = '#d0503c';
/** A flinch: how long the flash and shake last (ms) and how far it shakes (share of the radius). */
const FLINCH_MS = 320;
const SHAKE = 0.12;
/** A lunge toward the target and back, ms, and how far (share of the radius). */
const LUNGE_MS = 260;
const LUNGE = 0.6;

/** A ring on the ground under a token; strong ones glow. */
interface Ring {
  color: string;
  strong: boolean;
}

interface Sprite {
  root: Container;
  /** Shadow and, when selected, hovered or taking its turn, a ring on the ground. */
  ground: Graphics;
  /** The token's picture, drawn as it is with its transparency. */
  face: PixiSprite;
  /** Placeholder disc for tokens without a picture: the hooded stranger is cut to it. */
  disc: Graphics;
  faceMask: Graphics;
  /** Hit point bar and markers drawn over the disc. */
  status: Graphics;
  label: Text;
  /** Remaining points of an animated move. */
  route: Point[];
  token: TokenView;
  r: number;
  hover: boolean;
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
    const box = token.size * (this.session.world?.gridSize ?? 100);
    const r = box * DISC;
    view.token = token;
    view.r = r;
    trackHp(view, token);
    this.redrawGround(view);
    const cutout = cutoutOf(token);
    drawPlaceholder(view, cutout ? undefined : token.color);
    showTexture(view.face, portraitOf(token), cutout ? box : r * 2);
    redrawStatus(view);
    const { label, faint } = describe(token);
    view.label.text = label;
    view.label.position.set(0, r * 1.15);
    view.label.visible = this.labelsVisible;
    view.root.alpha = faint ? 0.5 : 1;
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

  /** Your tokens (owned or observed), which see for you, where they're drawn right now. The GM has none. */
  viewers(): Viewer[] {
    const you = this.session.you;
    if (!you || isGm(you)) return [];
    const out: Viewer[] = [];
    for (const t of this.session.tokens.values()) {
      const view = this.views.get(t.id);
      if (view && canObserve(t, you)) out.push({ token: t, at: [view.root.x, view.root.y] });
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

  /** Gold for the creature whose turn it is; your colour (or ally/foe) when selected or under the pointer. */
  private ringOf(view: Sprite): Ring | undefined {
    const { token } = view;
    const combat = this.session.combat;
    if (combat && currentTurn(combat) === token.id) return { color: TURN_COLOR, strong: true };
    if (this.session.selected === token.id || this.session.isSelected(token.id))
      return { color: this.session.you?.color ?? TURN_COLOR, strong: true };
    return view.hover ? { color: this.ringColor(token), strong: false } : undefined;
  }

  private redrawGround(view: Sprite): void {
    drawGround(view.ground.clear(), view.r, this.ringOf(view));
  }

  private ringColor(token: TokenView): string {
    const you = this.session.you;
    if (you && ownersOf(token).includes(you.id)) return you.color;
    return isParty(token) ? ALLY_RIM : OTHER_RIM;
  }

  private create(token: TokenView): Sprite {
    const root = new Container();
    const ground = new Graphics();
    const disc = new Graphics();
    const face = new PixiSprite();
    face.anchor.set(0.5);
    const faceMask = new Graphics();
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
    root.addChild(ground, disc, face, faceMask, status, label);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointerdown', (e) => {
      // Right and middle clicks go through to the map: panning, or cancelling an action.
      if (e.button !== 0) return;
      e.stopPropagation();
      const t = this.session.tokens.get(token.id);
      if (!t) return;
      if (this.session.aiming?.mode === 'creatures') return this.session.pickTarget(t.id);
      if (this.isTarget(t)) return this.session.attack(t.id);
      if (!this.session.canControl(t)) return;
      this.press(t.id, e);
    });
    this.container.addChild(root);
    const view: Sprite = { root, ground, disc, face, faceMask, status, label, route: [], token, r: 0, hover: false };
    this.watchHover(view);
    this.views.set(token.id, view);
    return view;
  }

  /**
   * A press on a token you control: shift adds or takes it from the
   * selection, ctrl takes it away; otherwise it is the one you act with and
   * can be dragged (with the rest of the selection). Double click: its sheet.
   */
  private press(id: string, e: FederatedPointerEvent): void {
    const s = this.session;
    s.closeMenu();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      s.setSelection(clickSelect(s.selection, s.tokenKey(id), modsOf(e)));
      return;
    }
    if (s.isSelected(id)) s.setPrimary(id);
    else s.select(id);
    if (this.isDoubleClick(id)) s.openSheet({ kind: 'token', id });
    else this.onGrab?.(id, [e.global.x, e.global.y]);
  }

  private watchHover(view: Sprite): void {
    const set = (hover: boolean) => {
      view.hover = hover;
      this.redrawGround(view);
    };
    view.root.on('pointerover', () => set(true));
    view.root.on('pointerout', () => set(false));
  }
}

const DOUBLE_CLICK_MS = 350;

/**
 * The name under a token, with notes for the GM, and whether it is drawn
 * faintly: hidden tokens, and invisible ones seen anyway (by their own side,
 * the GM, or truesight).
 */
function describe(token: TokenView): { label: string; faint: boolean } {
  const invisible = hasCondition(token, 'invisible');
  const notes = [token.hidden && 'hidden', invisible && 'invisible', token.visibleTo && 'illusion'].filter(Boolean);
  return {
    label: notes.length ? `${token.name} (${notes.join(', ')})` : token.name,
    faint: token.hidden || invisible,
  };
}

/**
 * Shows a picture once it has loaded, scaled to fit a `size` square without
 * stretching; switching pictures keeps the old one until then.
 */
function showTexture(sprite: PixiSprite, url: string, size: number): void {
  const key = `${url}@${size}`;
  if (sprite.label === key) return;
  sprite.label = key;
  void Assets.load<Texture>(url).then((texture) => {
    if (sprite.destroyed || sprite.label !== key) return;
    sprite.texture = texture;
    sprite.scale.set(size / Math.max(texture.width, texture.height, 1));
  });
}

/** A soft shadow under the token and, if it has one, its ring: a glowing band for strong rings. */
function drawGround(g: Graphics, r: number, ring: Ring | undefined): void {
  g.ellipse(0, r * 0.18, r * 0.95, r * 0.8).fill({ color: 0x000000, alpha: 0.28 });
  g.ellipse(0, r * 0.12, r * 0.7, r * 0.6).fill({ color: 0x000000, alpha: 0.22 });
  if (!ring) return;
  const at = r * 1.08;
  if (ring.strong) {
    g.circle(0, 0, at).stroke({ width: 16, color: ring.color, alpha: 0.12 });
    g.circle(0, 0, at).stroke({ width: 8, color: ring.color, alpha: 0.3 });
  }
  g.circle(0, 0, at).stroke({ width: ring.strong ? 3 : 2, color: ring.color, alpha: ring.strong ? 1 : 0.6 });
}

/** The round placeholder behind the hooded stranger, or nothing when the token has its own picture. */
function drawPlaceholder(view: Sprite, color: string | undefined): void {
  view.disc.clear();
  view.faceMask.clear();
  view.face.mask = color === undefined ? null : view.faceMask;
  if (color === undefined) return;
  const r = view.r;
  view.disc.circle(0, 0, r).fill(color);
  view.faceMask.circle(0, 0, r - 2).fill(0xffffff);
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

/** A hit point bar across the token's feet, with a pale trail of what was just lost, and a cross over creatures that are down. */
function drawStatus(g: Graphics, { bar }: Sprite, r: number): void {
  if (!bar) return;
  const share = bar.shown;
  const w = r * 1.6;
  const y = r * 0.85;
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

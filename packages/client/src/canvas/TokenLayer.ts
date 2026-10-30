import type { Point, Token } from '@vtt/shared';
import { Container, Graphics, Text } from 'pixi.js';
import type { Session } from '../session.ts';
import type { Viewer } from './Vision.ts';

/** Token walking speed when animating a move, pixels per second. */
const WALK_SPEED = 900;
/** Token disc radius as a share of its size in pixels. */
const DISC = 0.42;

interface TokenView {
  root: Container;
  disc: Graphics;
  label: Text;
  /** Remaining points of an animated move. */
  route: Point[];
}

/** Draws tokens and animates them along the paths they walk. */
export class TokenLayer {
  readonly container = new Container();
  private views = new Map<string, TokenView>();
  private labelsVisible = true;

  constructor(private session: Session) {}

  draw(token: Token): void {
    const view = this.views.get(token.id) ?? this.create(token);
    if (view.route.length === 0) view.root.position.set(token.x, token.y);
    const r = token.size * (this.session.world?.gridSize ?? 100) * DISC;
    view.disc
      .clear()
      .circle(0, 0, r)
      .fill(token.color)
      .stroke({ width: this.session.selected === token.id ? 8 : 4, color: this.ringColor(token) });
    const notes = [token.hidden && 'hidden', token.visibleTo && 'illusion'].filter(Boolean);
    view.label.text = notes.length ? `${token.name} (${notes.join(', ')})` : token.name;
    view.label.position.set(0, r + 4);
    view.label.visible = this.labelsVisible;
    view.root.alpha = token.hidden ? 0.5 : 1;
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

  private ringColor(token: Token): string {
    if (this.session.selected === token.id) return '#ffffff';
    const you = this.session.you;
    return you && token.controllers.includes(you.id) ? you.color : '#111111';
  }

  private create(token: Token): TokenView {
    const root = new Container();
    const disc = new Graphics();
    const label = new Text({
      text: '',
      style: { fill: 0xffffff, fontSize: 22, stroke: { color: 0x000000, width: 4 } },
    });
    label.anchor.set(0.5, 0);
    root.addChild(disc, label);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointerdown', (e) => {
      e.stopPropagation();
      const t = this.session.tokens.get(token.id);
      if (t && this.session.canControl(t)) this.session.select(t.id);
    });
    this.container.addChild(root);
    const view = { root, disc, label, route: [] };
    this.views.set(token.id, view);
    return view;
  }
}

/** Moves a token up to `distance` pixels along its route. */
function step(v: TokenView, distance: number): void {
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

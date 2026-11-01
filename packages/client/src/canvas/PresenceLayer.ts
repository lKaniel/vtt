import type { Point } from '@vtt/shared';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import { LongPress, PING_MS, type ShownPing } from '../presence.ts';
import type { Session } from '../session.ts';
import type { Targeter } from '../targets.ts';
import { LabelPool } from './label-pool.ts';
import { drawTargets, type PlaceOf } from './target-marks.ts';

const OUTLINE = 0x000000;
/** How fast a cursor catches up with where its player points (per second). */
const FOLLOW = 18;
/** The rings of a ping, in screen pixels. */
const RING = { from: 12, to: 70, count: 3 };

/**
 * Where everyone else is pointing, drawn over the map: each player's cursor
 * gliding after their pointer with their name beside it, and pings as rings
 * spreading from the spot in the pinger's colour. It also turns your pointer
 * into presence: where it is goes to the table, and a long press pings
 * (Shift: the GM pulls everyone's view there). Targets are marked here too
 * (see target-marks.ts), following their tokens as they walk.
 */
export class PresenceLayer {
  readonly container = new Container();
  private g = new Graphics();
  private labels = new LabelPool(this.container, {
    fill: 0xffffff,
    fontSize: 13,
    fontWeight: '600',
    stroke: { color: OUTLINE, width: 3 },
  });
  private zoom = 1;
  /** Where each cursor is drawn now, on its way to where it points. */
  private drawn = new Map<string, Point>();
  private dirty = true;
  /** Pings showed last frame: one more draw clears the last of them. */
  private pinging = false;
  /** Targets showed last frame. */
  private targeting = false;
  private press: LongPress;

  constructor(
    private session: Session,
    private placeOf: PlaceOf,
  ) {
    this.container.addChild(this.g);
    this.press = new LongPress((at, pull) => session.presence.ping(at, pull && session.isGm()));
  }

  /** Listens to the session and the canvas; returns what stops it. */
  attach(canvas: HTMLCanvasElement): () => void {
    const dirty = () => {
      this.dirty = true;
    };
    const offs = [this.session.on('presence', dirty), this.session.on('targets', dirty)];
    const left = () => this.session.presence.pointer(null);
    canvas.addEventListener('pointerleave', left);
    return () => {
      for (const off of offs) off();
      canvas.removeEventListener('pointerleave', left);
    };
  }

  /** A press on the map: a left one that holds still pings. */
  down(screen: Point, at: Point, e: FederatedPointerEvent): void {
    if (e.button === 0) this.press.down(screen, at, e.shiftKey);
  }

  /** The pointer moved to `at` (`screen` on the canvas). */
  move(screen: Point, at: Point): void {
    this.press.move(screen);
    this.session.presence.pointer(at);
  }

  /** Let go: true if the press pinged, so it isn't also a click. */
  up(): boolean {
    return this.press.up();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.dirty = true;
  }

  tick(dt: number, now: number): void {
    const pings = this.session.presence.pings(now);
    // Targets follow their tokens, which may be walking: redraw while there are any.
    const moving = this.follow(dt) || this.targeting;
    this.targeting = this.session.targets.any();
    if (!this.dirty && !moving && !pings.length && !this.pinging) return;
    this.dirty = false;
    this.pinging = pings.length > 0;
    this.g.clear();
    this.labels.begin(1 / this.zoom);
    drawTargets(this.g, this.targetMarks(), this.placeOf, 1 / this.zoom);
    for (const p of pings) this.drawPing(p, (now - p.since) / PING_MS);
    for (const c of this.session.presence.cursors.values()) this.drawCursor(this.drawn.get(c.player)!, c.color, c.name);
    this.labels.end();
  }

  /** Each token someone targets, with who does. */
  private *targetMarks(): Iterable<[string, Targeter[]]> {
    for (const id of this.session.tokens.keys()) yield [id, this.session.targets.on(id)];
  }

  /** Moves each drawn cursor towards where it points; true while any is still on its way. */
  private follow(dt: number): boolean {
    const cursors = this.session.presence.cursors;
    for (const id of this.drawn.keys()) if (!cursors.has(id)) this.drawn.delete(id);
    const k = 1 - Math.exp(-FOLLOW * dt);
    let moving = false;
    for (const c of cursors.values()) {
      const d = this.drawn.get(c.player) ?? c.at;
      const next: Point = [d[0] + (c.at[0] - d[0]) * k, d[1] + (c.at[1] - d[1]) * k];
      const far = Math.hypot(c.at[0] - next[0], c.at[1] - next[1]) * this.zoom > 0.5;
      this.drawn.set(c.player, far ? next : c.at);
      moving ||= far;
    }
    return moving;
  }

  /** `t`: how far through its life the ping is, 0 to 1. */
  private drawPing(p: ShownPing, t: number): void {
    const px = 1 / this.zoom;
    const [x, y] = p.at;
    for (let i = 0; i < RING.count; i++) {
      const r = (t * 1.6 - i * 0.25) % 1;
      if (r < 0) continue;
      const radius = (RING.from + (RING.to - RING.from) * r) * px;
      const alpha = (1 - r) * (1 - t * 0.5);
      this.g.circle(x, y, radius).stroke({ width: 4 * px, color: p.color, alpha });
    }
    this.g
      .circle(x, y, 6 * px)
      .fill({ color: p.color, alpha: 1 - t })
      .stroke({ width: 2 * px, color: OUTLINE, alpha: 1 - t });
    this.label([x, y - RING.from * 1.6 * px], p.name, [0.5, 1]);
  }

  /** An arrow pointing at `at`, and its player's name. */
  private drawCursor(at: Point, color: string, name: string): void {
    const s = 1 / this.zoom;
    const [x, y] = at;
    const shape = [0, 0, 0, 18, 4.5, 14, 8, 21, 11, 19.5, 7.5, 13, 13, 13].map((v, i) => v * s + (i % 2 ? y : x));
    this.g
      .poly(shape)
      .fill({ color })
      .stroke({ width: 1.5 * s, color: OUTLINE });
    this.label([x + 14 * s, y + 16 * s], name, [0, 0], color);
  }

  private label(at: Point, text: string, anchor: Point, fill: string | number = 0xffffff): void {
    this.labels.add(at, text, fill, anchor);
  }
}

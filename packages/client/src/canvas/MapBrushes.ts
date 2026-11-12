import type { Point } from '@vtt/shared';
import { Container } from 'pixi.js';
import type { Session } from '../session/session.ts';
import { FogBrush } from './FogBrush.ts';
import { StampBrush } from './StampBrush.ts';

/**
 * The GM's brushes on the map: the fog brush (FogBrush.ts) and the stamp
 * brush (StampBrush.ts). At most one is in hand; a press goes to it before
 * the editor.
 */
export class MapBrushes {
  readonly container = new Container();
  private fog: FogBrush;
  private stamp: StampBrush;

  constructor(session: Session) {
    this.fog = new FogBrush(session);
    this.stamp = new StampBrush(session);
    this.container.eventMode = 'none';
    this.container.addChild(this.fog.container, this.stamp.container);
  }

  /** A brush is in hand: clicks go to it, not to tokens and doors. */
  get active(): boolean {
    return this.fog.active || this.stamp.active;
  }

  setZoom(zoom: number): void {
    this.fog.setZoom(zoom);
    this.stamp.setZoom(zoom);
  }

  /** A press: true when a brush took it. */
  down(at: Point, button: number, shift: boolean): boolean {
    return this.fog.down(at, button) || this.stamp.down(at, button, shift);
  }

  move(at: Point, shift: boolean): void {
    this.fog.move(at);
    this.stamp.move(at, shift);
  }

  /** Lets go: true when a brush had the press. */
  up(): boolean {
    return this.fog.up() || this.stamp.up();
  }

  /** A right click puts the stamp brush down; true if it was in hand. */
  putDown(): boolean {
    return this.stamp.putDown();
  }
}

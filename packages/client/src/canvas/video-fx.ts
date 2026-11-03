import type { Point } from '@vtt/shared';
import { Sprite, Texture } from 'pixi.js';
import type { Fx } from './fx.ts';

// A video animation (a JB2A pack's .webm, with alpha): a projectile stretched
// from the attacker to the target, or a burst played on the target. It ends
// when the video does, or after LONGEST so a stuck video never lingers.

const LONGEST = 5000;
/** An on-target video covers this many times the target's radius. */
const ON_TARGET = 3;

/** How a video lies: stretched toward `to` (`reach` px long, else all the way), or over it, `cover` times its radius. */
export interface VideoLayout {
  ranged: boolean;
  reach?: number;
  cover?: number;
}

interface Path extends VideoLayout {
  from: Place;
  to: Place;
}

interface Place {
  at: Point;
  r: number;
}

function videoElement(url: string): HTMLVideoElement {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  void video.play().catch(() => undefined);
  return video;
}

/** Lays the sprite out once the video knows its size. */
function layout(sprite: Sprite, video: HTMLVideoElement, { from, to, ranged, reach, cover }: Path): void {
  const w = video.videoWidth || 1;
  const h = video.videoHeight || 1;
  if (ranged) {
    const dx = to.at[0] - from.at[0];
    const dy = to.at[1] - from.at[1];
    sprite.anchor.set(0, 0.5);
    sprite.position.set(from.at[0], from.at[1]);
    sprite.rotation = Math.atan2(dy, dx);
    const scale = (reach ?? Math.hypot(dx, dy)) / w;
    sprite.scale.set(scale);
  } else {
    sprite.anchor.set(0.5);
    sprite.position.set(to.at[0], to.at[1]);
    sprite.scale.set((to.r * 2 * (cover ?? ON_TARGET)) / Math.max(w, h));
  }
}

export function videoFx(url: string, from: Place, to: Place, how: VideoLayout): Fx {
  const video = videoElement(url);
  // The texture is made once the video has a frame: uploading an empty one fails (bad image data).
  const sprite = new Sprite(Texture.EMPTY);
  sprite.visible = false;
  let placed = false;
  return {
    view: sprite,
    update(ms) {
      if (!placed && video.readyState >= 2) {
        sprite.texture = Texture.from(video);
        layout(sprite, video, { from, to, ...how });
        placed = true;
        sprite.visible = true;
      }
      const over = video.ended || ms > LONGEST || !!video.error;
      if (over) video.pause();
      return !over;
    },
  };
}

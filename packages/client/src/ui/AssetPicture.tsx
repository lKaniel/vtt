import type { MediaEntry } from '@vtt/core';
import { BoxIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../assets.ts';
import { modelInfos, type ModelInfo } from '../view3d/model-thumbs.ts';

// What a file in the Assets tab (and on the stamp brush) looks like: a
// picture as it is, a video's still (playing while the pointer is over it),
// and a 3D model drawn from the side once it scrolls into view
// (view3d/model-thumbs.ts keeps the drawing for next time).

type Sized = (size: { w: number; h: number }) => void;

/** The model's picture and size, drawn once the element is on screen. */
function useModelInfo(src: string, ref: React.RefObject<HTMLElement | null>): ModelInfo | undefined {
  const infos = modelInfos();
  const [loaded, setLoaded] = useState<{ src: string; info: ModelInfo }>();
  useEffect(() => {
    if (infos.peek(src)) return;
    let live = true;
    const load = () => {
      infos.of(src).then(
        (info) => {
          if (live) setLoaded({ src, info });
        },
        () => undefined,
      );
    };
    const el = ref.current;
    const seen = el && typeof IntersectionObserver !== 'undefined' ? watch(el, load) : (load(), undefined);
    return () => {
      live = false;
      seen?.disconnect();
    };
  }, [infos, src, ref]);
  return infos.peek(src) ?? (loaded?.src === src ? loaded.info : undefined);
}

/** Calls `seen` once `el` scrolls into view. */
function watch(el: HTMLElement, seen: () => void): IntersectionObserver {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    seen();
  });
  observer.observe(el);
  return observer;
}

function ModelPicture({
  media,
  className,
}: Readonly<{ media: Pick<MediaEntry, 'src' | 'name' | 'thumb'>; className?: string }>) {
  const ref = useRef<HTMLSpanElement>(null);
  const info = useModelInfo(media.src, ref);
  const still = media.thumb ? assetUrl(media.thumb) : info?.thumb;
  return (
    <span ref={ref} className={`flex items-center justify-center ${className ?? ''}`} data-model={media.src}>
      {still ? (
        <img src={still} alt={media.name} className="h-full w-full object-contain" />
      ) : (
        <BoxIcon aria-label={media.name} className={info ? 'size-6 opacity-40' : 'size-6 animate-pulse opacity-40'} />
      )}
    </span>
  );
}

function VideoPicture({ media, onSize }: Readonly<{ media: MediaEntry; onSize?: Sized }>) {
  const [hover, setHover] = useState(false);
  if (media.thumb && !hover)
    return <img src={assetUrl(media.thumb)} alt={media.name} loading="lazy" onMouseEnter={() => setHover(true)} />;
  return (
    <video
      src={assetUrl(media.src)}
      muted
      loop
      playsInline
      preload="metadata"
      autoPlay={hover}
      aria-label={media.name}
      className="h-[72px] w-full bg-black/40 object-contain"
      onMouseEnter={(e) => {
        setHover(true);
        e.currentTarget.play().catch(() => undefined);
      }}
      onMouseLeave={(e) => {
        setHover(false);
        e.currentTarget.pause();
      }}
      onLoadedMetadata={(e) => onSize?.({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
    />
  );
}

/** A file's picture: `onSize` hears a picture's or video's pixels once loaded. */
export function AssetPicture({
  media,
  onSize,
  className,
}: Readonly<{ media: MediaEntry; onSize?: Sized; className?: string }>) {
  if (media.kind === 'model') return <ModelPicture media={media} className={className ?? 'h-[72px] w-full'} />;
  if (media.kind === 'video') return <VideoPicture media={media} onSize={onSize} />;
  return (
    <img
      src={assetUrl(media.thumb ?? media.src)}
      alt={media.name}
      loading="lazy"
      className={className}
      // A thumbnail's pixels aren't the picture's: the brush measures the picture itself.
      onLoad={(e) => !media.thumb && onSize?.({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
    />
  );
}

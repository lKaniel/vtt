import { Slider as SliderPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = (value ?? defaultValue ?? [min]).length;
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=horizontal]:h-5',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full border border-black/60 bg-black/50"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-linear-to-r from-gold-dim to-gold"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          data-slot="slider-thumb"
          className="block size-3.5 cursor-grab rounded-full border border-gold-bright/70 bg-linear-to-b from-[#e8d3a6] to-[#a88a5e] shadow-[0_1px_4px_rgba(0,0,0,0.7)] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };

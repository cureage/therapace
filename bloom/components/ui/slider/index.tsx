'use client';
import React from 'react';
import { Pressable, View } from 'react-native';
import { createSlider } from '@gluestack-ui/core/slider/creator';
import {
  tva,
  useStyleContext,
  withStyleContext,
  type VariantProps,
} from '@gluestack-ui/utils/nativewind-utils';

const SCOPE = 'SLIDER';

const UISlider = createSlider({
  Root: withStyleContext(View, SCOPE),
  Thumb: View,
  Track: Pressable,
  FilledTrack: View,
  ThumbInteraction: View,
});

// The creator applies its own inline track height, so pass the size's height through it.
const TRACK_HEIGHT = { sm: 4, md: 8, lg: 12 } as const;

const sliderStyle = tva({
  base: 'w-full items-center justify-center data-[disabled=true]:opacity-40',
  variants: {
    size: {
      sm: 'h-6',
      md: 'h-10',
      lg: 'h-12',
    },
  },
});

const sliderTrackStyle = tva({
  base: 'bg-primary/20 w-full flex-row overflow-hidden rounded-full',
});

const sliderFilledTrackStyle = tva({
  base: 'bg-primary h-full rounded-full',
});

const sliderThumbStyle = tva({
  base: 'bg-primary absolute rounded-full border-2 border-white shadow-md',
  parentVariants: {
    size: {
      sm: 'h-4 w-4',
      md: 'h-7 w-7',
      lg: 'h-8 w-8',
    },
  },
});

type ISliderProps = Omit<
  React.ComponentPropsWithoutRef<typeof UISlider>,
  'context' | 'orientation' | 'isReversed' | 'sliderTrackHeight'
> &
  VariantProps<typeof sliderStyle> & { className?: string };

/** Horizontal slider: `<Slider><SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb /></Slider>`. */
const Slider = React.forwardRef<React.ComponentRef<typeof UISlider>, ISliderProps>(function Slider(
  { className, size = 'md', ...props },
  ref
) {
  return (
    <UISlider
      ref={ref}
      {...props}
      sliderTrackHeight={TRACK_HEIGHT[size]}
      className={sliderStyle({ size, class: className })}
      context={{ size }}
    />
  );
});

type ISliderTrackProps = React.ComponentPropsWithoutRef<typeof UISlider.Track> & {
  className?: string;
};

const SliderTrack = React.forwardRef<React.ComponentRef<typeof UISlider.Track>, ISliderTrackProps>(
  function SliderTrack({ className, ...props }, ref) {
    return (
      <UISlider.Track ref={ref} {...props} className={sliderTrackStyle({ class: className })} />
    );
  }
);

type ISliderFilledTrackProps = React.ComponentPropsWithoutRef<typeof UISlider.FilledTrack> & {
  className?: string;
};

const SliderFilledTrack = React.forwardRef<
  React.ComponentRef<typeof UISlider.FilledTrack>,
  ISliderFilledTrackProps
>(function SliderFilledTrack({ className, ...props }, ref) {
  return (
    <UISlider.FilledTrack
      ref={ref}
      {...props}
      className={sliderFilledTrackStyle({ class: className })}
    />
  );
});

type ISliderThumbProps = React.ComponentPropsWithoutRef<typeof UISlider.Thumb> & {
  className?: string;
};

const SliderThumb = React.forwardRef<React.ComponentRef<typeof UISlider.Thumb>, ISliderThumbProps>(
  function SliderThumb({ className, ...props }, ref) {
    const { size } = useStyleContext(SCOPE);
    return (
      <UISlider.Thumb
        ref={ref}
        {...props}
        className={sliderThumbStyle({ parentVariants: { size }, class: className })}
      />
    );
  }
);

export { Slider, SliderFilledTrack, SliderThumb, SliderTrack };

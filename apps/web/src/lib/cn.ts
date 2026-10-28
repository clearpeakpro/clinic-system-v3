import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge debe conocer los tamaños de texto propios (text-body-lg…)
// para no confundirlos con colores de texto.
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-md',
            'headline-lg',
            'headline-md',
            'headline-sm',
            'body-lg',
            'body-lg-medium',
            'body-md',
            'body-md-medium',
            'caption',
            'code-md',
            'code-sm',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}

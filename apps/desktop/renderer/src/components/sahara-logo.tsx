import { cn } from '@renderer/lib/utils';
import { useTheme } from '@renderer/components/theme-provider';

import logoDark from '@renderer/assets/logo-dark.png';
import logoLight from '@renderer/assets/logo-light.png';

type SaharaLogoProps = {
  className?: string;
  variant?: 'auto' | 'light' | 'dark';
  /** Use when visible brand text sits beside the logo (avoids duplicate screen reader announcements). */
  decorative?: boolean;
  alt?: string;
};

export function SaharaLogo({
  className,
  variant = 'auto',
  decorative = false,
  alt = 'Sahara'
}: SaharaLogoProps) {
  const { resolvedTheme } = useTheme();
  const theme = variant === 'auto' ? resolvedTheme : variant;
  const src = theme === 'dark' ? logoDark : logoLight;

  return (
    <img
      src={src}
      alt={decorative ? '' : alt}
      aria-hidden={decorative || undefined}
      className={cn('block shrink-0 object-contain', className)}
      draggable={false}
    />
  );
}

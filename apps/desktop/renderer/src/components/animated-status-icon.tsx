import { cn } from '@renderer/lib/utils';

type StatusIconVariant = 'completed' | 'failed' | 'cancelled' | 'running' | 'pending' | 'blocked';

const iconStyles = `
@keyframes status-check-draw {
  0% { stroke-dashoffset: 24; }
  100% { stroke-dashoffset: 0; }
}
@keyframes status-x-draw {
  0% { stroke-dashoffset: 20; }
  100% { stroke-dashoffset: 0; }
}
@keyframes status-circle-fill {
  0% { transform: scale(0.6); opacity: 0; }
  50% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes status-spin {
  100% { transform: rotate(360deg); }
}
`;

function resolveVariant(variant: StatusIconVariant) {
  switch (variant) {
    case 'completed':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-950/40',
        ring: 'ring-emerald-200 dark:ring-emerald-800/50',
        stroke: '#059669',
        type: 'check' as const
      };
    case 'failed':
    case 'cancelled':
    case 'blocked':
      return {
        bg: 'bg-red-100 dark:bg-red-950/40',
        ring: 'ring-red-200 dark:ring-red-800/50',
        stroke: '#dc2626',
        type: 'x' as const
      };
    case 'running':
    case 'pending':
      return {
        bg: 'bg-sky-100 dark:bg-sky-950/40',
        ring: 'ring-sky-200 dark:ring-sky-800/50',
        stroke: '#0284c7',
        type: 'spinner' as const
      };
  }
}

export function AnimatedStatusIcon({
  variant,
  size = 48,
  className
}: {
  variant: StatusIconVariant;
  size?: number;
  className?: string;
}) {
  const v = resolveVariant(variant);
  const iconSize = size * 0.5;

  return (
    <>
      <style>{iconStyles}</style>
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-full ring-2',
          v.bg,
          v.ring,
          className
        )}
        style={{ width: size, height: size, animation: 'status-circle-fill 0.4s ease-out both' }}
        role="img"
        aria-label={`Status: ${variant}`}
      >
        {v.type === 'check' && (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={v.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline
              points="4 12 10 18 20 6"
              style={{
                strokeDasharray: 24,
                strokeDashoffset: 0,
                animation: 'status-check-draw 0.45s ease-out 0.2s both'
              }}
            />
          </svg>
        )}

        {v.type === 'x' && (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={v.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line
              x1="6" y1="6" x2="18" y2="18"
              style={{
                strokeDasharray: 20,
                strokeDashoffset: 0,
                animation: 'status-x-draw 0.35s ease-out 0.15s both'
              }}
            />
            <line
              x1="18" y1="6" x2="6" y2="18"
              style={{
                strokeDasharray: 20,
                strokeDashoffset: 0,
                animation: 'status-x-draw 0.35s ease-out 0.25s both'
              }}
            />
          </svg>
        )}

        {v.type === 'spinner' && (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={v.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
            style={{ animation: 'status-spin 1.1s linear infinite' }}
          >
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        )}
      </div>
    </>
  );
}

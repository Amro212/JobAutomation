import type { BadgeProps } from '@/components/ui/badge';

export function autopilotStatusVariant(status: string): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'completed':
      return 'success';
    case 'partial':
    case 'running':
      return 'warning';
    case 'failed':
      return 'destructive';
    case 'cancelled':
      return 'outline';
    default:
      return 'outline';
  }
}

export function autopilotStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

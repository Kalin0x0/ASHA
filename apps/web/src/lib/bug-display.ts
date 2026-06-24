import type { BugSeverity, BugSource, BugStatus } from '@/lib/types';

type BadgeVariant =
  | 'default'
  | 'gold'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'outline';

export const BUG_STATUSES: BugStatus[] = [
  'OPEN',
  'TRIAGED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'WONT_FIX',
  'DUPLICATE',
];

export const BUG_SEVERITIES: BugSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const severityVariant: Record<BugSeverity, BadgeVariant> = {
  LOW: 'outline',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'destructive',
};

export const statusVariant: Record<BugStatus, BadgeVariant> = {
  OPEN: 'info',
  TRIAGED: 'default',
  IN_PROGRESS: 'gold',
  RESOLVED: 'success',
  CLOSED: 'outline',
  WONT_FIX: 'outline',
  DUPLICATE: 'outline',
};

export const sourceVariant: Record<BugSource, BadgeVariant> = {
  USER: 'default',
  AUTOMATIC: 'warning',
};

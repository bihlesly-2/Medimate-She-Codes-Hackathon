export const money = (amount: number | null, currency = 'XAF') =>
  amount === null ? 'Price not listed' : `${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(amount)} ${currency === 'XAF' ? 'FCFA' : currency}`;

export function dateTime(iso: string, tz?: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
export function dateOnly(iso: string, tz?: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
}
export function shortDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(d),
    day: d.getUTCDate(),
    month: new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d),
  };
}

export function todayIn(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Upcoming',
  sent: 'Waiting for your answer',
  taken: 'Taken',
  skipped: 'Skipped',
  missed: 'Not confirmed',
  open: 'Open',
  answered: 'Answered',
  closed: 'Closed',
  pending: 'Pending',
  approved: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
  suspended: 'Suspended',
  draft: 'Draft',
  in_review: 'In review',
  verified: 'Verified',
  none: 'Not reviewed yet',
  published: 'Published',
  archived: 'Archived',
  active: 'Active',
  revoked: 'Revoked',
  declined: 'Declined',
  investigating: 'Investigating',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  successful: 'Paid',
  failed: 'Failed',
  created: 'Started',
};

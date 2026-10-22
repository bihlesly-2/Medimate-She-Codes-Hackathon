import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, BellRing, CalendarCheck, Droplets, HeartHandshake, Package, Pill, Sparkles } from 'lucide-react';
import { Button, EmptyState, List, Notice, PageHeader, QueryView, cx, errorMessage, useToast } from '../../components/ui';
import { api, post } from '../../lib/api';
import { useConfig } from '../../lib/auth';
import { dateTime } from '../../lib/format';
import { disablePush, enablePush, pushPermission, pushSupport } from '../../lib/push';

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: string;
}

const ICON: Record<string, typeof Bell> = { reminder: Pill, followup: Pill, refill: Package, checkup: CalendarCheck, caretaker: HeartHandshake, nudge: Droplets, welcome: Sparkles };

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number; items: NotificationItem[] }>('/me/notifications'), refetchInterval: 60_000 });
}

/** Turn pop-up notifications on or off for this device. */
export function PushToggle() {
  const { data: config } = useConfig();
  const toast = useToast();
  const [perm, setPerm] = useState(pushPermission());
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const support = pushSupport();
  useEffect(() => {
    void navigator.serviceWorker
      ?.getRegistration()
      .then((r) => r?.pushManager.getSubscription())
      .then((s) => setSubscribed(Boolean(s)))
      .catch(() => setSubscribed(false));
  }, []);
  const on = useMutation({
    mutationFn: () => enablePush(config!.vapidPublicKey!),
    onSuccess: (r) => {
      setPerm(pushPermission());
      setSubscribed(r === 'enabled');
      toast(r === 'enabled' ? 'Notifications are on.' : r === 'denied' ? 'Notifications are blocked in your browser settings.' : 'This browser cannot show notifications.', r === 'enabled' ? 'success' : 'info');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const off = useMutation({ mutationFn: disablePush, onSuccess: () => setSubscribed(false) });
  const test = useMutation({ mutationFn: () => post('/me/push/test'), onSuccess: () => toast('Test sent. It should pop up in a moment.', 'info') });

  if (!config?.vapidPublicKey) return <Notice>Pop-up notifications are not set up on this server yet. Reminders still appear here and by SMS.</Notice>;
  if (support === 'ios-install') return <Notice>On iPhone, add MEDIMATE to your home screen first (Share, then Add to Home Screen), then open it from there to turn on notifications.</Notice>;
  if (support === 'unsupported') return <Notice>This browser cannot show notifications. Reminders still appear here and by SMS.</Notice>;
  if (perm === 'denied') return <Notice tone="warning">Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.</Notice>;
  return subscribed ? (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" icon={BellRing} loading={test.isPending} onClick={() => test.mutate()}>
        Send a test
      </Button>
      <Button variant="ghost" icon={BellOff} loading={off.isPending} onClick={() => off.mutate()}>
        Turn off
      </Button>
    </div>
  ) : (
    <Button variant="primary" size="lg" icon={BellRing} className="w-full" loading={on.isPending} onClick={() => on.mutate()}>
      Turn on pop-up reminders
    </Button>
  );
}

export default function Notifications() {
  const q = useNotifications();
  const qc = useQueryClient();
  const read = useMutation({ mutationFn: () => post('/me/notifications/read'), onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = q.data?.unread ?? 0;
  useEffect(() => {
    if (unread > 0) {
      const t = setTimeout(() => read.mutate(), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Notifications" subtitle="Reminders, nudges and messages. They also pop up on this phone when notifications are on." />
      <div className="mb-5">
        <PushToggle />
      </div>
      <QueryView query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState icon={Bell} title="Nothing yet">
              Your reminders and daily nudges will appear here.
            </EmptyState>
          ) : (
            <List label="Notifications">
              {d.items.map((n) => {
                const Icon = ICON[n.kind] ?? Bell;
                const body = (
                  <span className="flex items-start gap-3 px-4 py-3">
                    <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', n.read ? 'bg-slate-100 text-muted' : 'bg-primary-50 text-primary-600')}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block font-brand font-extrabold', n.read ? 'text-ink' : 'text-primary-700')}>{n.title}</span>
                      <span className="block text-sm text-muted">{n.body}</span>
                      <span className="block text-xs text-muted">{dateTime(n.createdAt)}</span>
                    </span>
                    {!n.read ? <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary-500" aria-label="Unread" /> : null}
                  </span>
                );
                return <li key={n.id}>{n.url ? <Link to={n.url} className="block hover:bg-sky">{body}</Link> : body}</li>;
              })}
            </List>
          )
        }
      </QueryView>
    </div>
  );
}

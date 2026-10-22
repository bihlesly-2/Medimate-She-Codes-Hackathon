import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Activity, Bell, CalendarCheck, ClipboardList, CreditCard, Crown, FileClock, Flame, HeartHandshake, LayoutDashboard, LogOut, MessageSquare, Pill, Settings, ShieldCheck, Smartphone, Sparkles, Store, Users } from 'lucide-react';
import { LogoMark } from '../../components/brand';
import { InstallAppButton } from '../../components/install';
import { List, ListRow, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { hasRole, useLogout, useMe } from '../../lib/auth';
import type { Subscription } from '../../lib/types';

/** The "Me" tab: one tidy hub for everything that is not on the bottom bar (replaces the hamburger menu). */
export default function Me() {
  const { data: me } = useMe();
  const logout = useLogout();
  const progress = useQuery({ queryKey: ['progress'], queryFn: () => api<{ medication: { streak: number }; steps: { streak: number }; water: { streak: number } }>('/progress'), retry: false });
  const sub = useQuery({ queryKey: ['subscription'], queryFn: () => api<Subscription>('/me/subscription') });
  if (!me) return null;
  const stats = [
    { label: 'Medicine streak', value: progress.data?.medication.streak ?? 0, color: 'text-[#ff9600]' },
    { label: 'Water streak', value: progress.data?.water.streak ?? 0, color: 'text-primary-500' },
    { label: 'Steps streak', value: progress.data?.steps.streak ?? 0, color: 'text-secondary-600' },
  ];
  return (
    <div className="mx-auto max-w-xl">
      <header className="flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white shadow-[0_4px_0_var(--color-border)]">
          <LogoMark size={48} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[26px] leading-tight">{me.displayName ?? 'My account'}</h1>
          <p className="truncate text-sm text-muted">{me.phone ?? me.email}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-secondary-700">
            {sub.data?.tier === 'premium' ? <Crown className="size-4" aria-hidden /> : null}
            {sub.data?.tier === 'trial' ? `Free trial · ${sub.data.daysLeft} days left` : sub.data?.tier === 'premium' ? 'Premium' : sub.data ? 'Free plan' : ''}
          </p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <Link key={s.label} to="/app/progress" className="card-3d rounded-2xl bg-white p-3 text-center">
            <span className={cx('flex items-center justify-center gap-1 font-brand text-2xl font-extrabold', s.color)}>
              <Flame className="size-5" aria-hidden /> {s.value}
            </span>
            <span className="text-[11px] font-bold text-muted">{s.label}</span>
          </Link>
        ))}
      </div>

      <h2 className="mb-2 mt-7 text-lg">My health</h2>
      <List label="My health">
        <ListRow to="/app/medicines" icon={Pill} title="My medicines" detail="From your prescription" />
        <ListRow to="/app/checkups" icon={CalendarCheck} tone="green" title="Checkups" />
        <ListRow to="/app/progress" icon={Activity} title="Streaks and progress" />
        <ListRow to="/app/history" icon={FileClock} title="History and clinician PDF" />
      </List>

      <h2 className="mb-2 mt-7 text-lg">People</h2>
      <List label="People">
        <ListRow to="/app/care" icon={Users} title="My caretakers" detail="Who can help and what they see" />
        <ListRow to="/app/messages" icon={MessageSquare} title="Messages with pharmacies" />
        {hasRole(me, 'caretaker') ? <ListRow to="/care" icon={HeartHandshake} tone="green" title="People I care for" /> : null}
      </List>

      {hasRole(me, 'pharmacy', 'admin', 'reviewer') ? (
        <>
          <h2 className="mb-2 mt-7 text-lg">Work</h2>
          <List label="Work">
            {hasRole(me, 'pharmacy') ? <ListRow to="/pharmacy" icon={Store} title="Pharmacy portal" detail="Stock, prices and inquiries" /> : null}
            {hasRole(me, 'pharmacy') ? <ListRow to="/pharmacy/stock" icon={ClipboardList} title="Update stock" /> : null}
            {hasRole(me, 'admin', 'reviewer') ? <ListRow to="/admin" icon={LayoutDashboard} title="Admin" detail="Verification, content, reports" /> : null}
          </List>
        </>
      ) : null}

      <h2 className="mb-2 mt-7 text-lg">Account</h2>
      <List label="Account">
        <ListRow to="/app/assistant" icon={Sparkles} tone="green" title="Ask MEDIMATE" detail="Log things or find a medicine by just saying it" />
        <ListRow to="/app/notifications" icon={Bell} title="Notifications" detail="Pop-up reminders on this phone" />
        <ListRow to="/app/billing" icon={CreditCard} title="Plan and payments" />
        <ListRow to="/app/settings" icon={Settings} title="Settings" detail="Profile, sign-in, privacy, language" />
        <ListRow to="/simulator" icon={Smartphone} tone="muted" title="Try SMS and USSD" />
        <ListRow to="/safety" icon={ShieldCheck} tone="muted" title="Safety and privacy" />
      </List>

      <div className="mt-6 grid gap-3">
        <InstallAppButton size="md" className="w-full" />
        <button type="button" onClick={() => void logout()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl font-brand font-extrabold text-danger hover:bg-danger-bg">
          <LogOut className="size-5" aria-hidden /> Sign out
        </button>
      </div>
    </div>
  );
}

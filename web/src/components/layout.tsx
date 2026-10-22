import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Bell,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  Droplets,
  FileClock,
  Flag,
  Footprints,
  HeartPulse,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Pill,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  Upload,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { hasRole, useConfig, useLogout, useMe } from '../lib/auth';
import { BrandLink, Wordmark } from './brand';
import { InstallAppButton } from './install';
import { cx } from './ui';

/** Shown only when the API cannot be reached, so missing features are explained, not hidden. */
export function DemoBanner() {
  const { isError } = useConfig();
  if (!isError) return null;
  return (
    <div className="border-b border-red-200 bg-danger-bg px-4 py-1.5 text-center text-xs text-[#7a1717] sm:text-sm" role="alert">
      MEDIMATE cannot reach its server right now. Search, sign-in and the simulator will work again when it is back.
    </div>
  );
}

function SkipLink() {
  const { t } = useTranslation();
  return (
    <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-50 rounded-lg bg-primary-700 px-4 py-2 text-white">
      {t('skip')}
    </a>
  );
}

export function Footer() {
  const { data } = useConfig();
  return (
    <footer className="mt-12 border-t border-border bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark tagline />
          <p className="mt-3 max-w-sm text-sm text-muted">
            Built in Buea for the She Codes hackathon. MEDIMATE does not diagnose, prescribe or replace a pharmacist or health worker.
          </p>
        </div>
        <nav aria-label="Footer" className="grid gap-2 text-sm">
          <p className="font-bold text-ink">Use it</p>
          <Link className="text-muted hover:text-primary-700" to="/find">Find a pharmacy</Link>
          <Link className="text-muted hover:text-primary-700" to="/medicines">Medicine information</Link>
          <Link className="text-muted hover:text-primary-700" to="/simulator">Try SMS and USSD</Link>
          <Link className="text-muted hover:text-primary-700" to="/login">Sign in</Link>
        </nav>
        <nav aria-label="Legal" className="grid gap-2 text-sm">
          <p className="font-bold text-ink">Trust</p>
          <Link className="text-muted hover:text-primary-700" to="/privacy">Privacy</Link>
          <Link className="text-muted hover:text-primary-700" to="/terms">Terms</Link>
          <Link className="text-muted hover:text-primary-700" to="/safety">Safety</Link>
          <Link className="text-muted hover:text-primary-700" to="/support">Support</Link>
        </nav>
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-xs text-muted">
        SMS number {data?.smsShortCode ?? ''} and USSD code {data?.ussdCode ?? ''} are placeholders until a telecom operator provisions them.
      </div>
    </footer>
  );
}

export function PublicLayout() {
  const { t } = useTranslation();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const links = [
    { to: '/find', label: t('nav.find') },
    { to: '/medicines', label: t('nav.medicines') },
    { to: '/simulator', label: t('nav.simulator') },
  ];
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <DemoBanner />
      <header className="sticky top-0 z-30 border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <BrandLink />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('rounded-lg px-3 py-2 text-[15px] font-semibold', isActive ? 'text-primary-700 underline underline-offset-8' : 'text-ink hover:text-primary-700')}>
                {l.label}
              </NavLink>
            ))}
            <InstallAppButton className="ml-2" />
            <Link to={me.data ? '/app' : '/login'} className="ml-2 inline-flex min-h-11 items-center rounded-xl bg-primary-600 px-4 text-[15px] font-semibold text-white hover:bg-primary-700">
              {me.data ? 'My MEDIMATE' : t('nav.signIn')}
            </Link>
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            <InstallAppButton />
            <button className="grid size-11 place-items-center rounded-xl border border-border" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            <span className="sr-only">{t('nav.menu')}</span>
            </button>
          </div>
        </div>
        {open ? (
          <nav id="mobile-nav" aria-label="Main" className="grid border-t border-border md:hidden" onClick={() => setOpen(false)}>
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="border-b border-border px-4 py-3.5 font-semibold">
                {l.label}
              </Link>
            ))}
            <div className="p-4">
              <Link to={me.data ? '/app' : '/login'} className="flex min-h-12 items-center justify-center rounded-xl bg-primary-600 font-semibold text-white">
                {me.data ? 'My MEDIMATE' : t('nav.signIn')}
              </Link>
            </div>
          </nav>
        ) : null}
      </header>
      <main id="main" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

function useNavGroups() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const invites = useQuery({ queryKey: ['care', 'invites'], queryFn: () => api<{ items: unknown[] }>('/caretaker/invites'), enabled: !!me, staleTime: 60_000 });
  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: t('nav.myHealth'),
      items: [
        { to: '/app', label: t('nav.dashboard'), icon: Home, end: true },
        { to: '/app/reminders', label: t('nav.reminders'), icon: Bell },
        { to: '/app/medicines', label: t('nav.myMedicines'), icon: Pill },
        { to: '/app/checkups', label: t('nav.checkups'), icon: CalendarCheck },
        { to: '/app/health', label: t('nav.health'), icon: HeartPulse },
        { to: '/app/activity', label: t('nav.activity'), icon: Footprints },
        { to: '/app/water', label: t('nav.water'), icon: Droplets },
        { to: '/app/progress', label: t('nav.progress'), icon: Activity },
        { to: '/app/history', label: t('nav.history'), icon: FileClock },
        { to: '/app/messages', label: t('nav.messages'), icon: MessageSquare },
        { to: '/app/care', label: t('nav.caretakers'), icon: Users },
        { to: '/find', label: t('nav.find'), icon: Search },
      ],
    },
  ];
  if (hasRole(me, 'caretaker') || (invites.data?.items.length ?? 0) > 0) {
    groups.push({ title: t('nav.care'), items: [{ to: '/care', label: t('nav.care'), icon: Users, end: true }] });
  }
  if (hasRole(me, 'pharmacy')) {
    groups.push({
      title: t('nav.pharmacy'),
      items: [
        { to: '/pharmacy', label: 'Overview', icon: Store, end: true },
        { to: '/pharmacy/stock', label: 'Stock & prices', icon: ClipboardList },
        { to: '/pharmacy/import', label: 'CSV import', icon: Upload },
        { to: '/pharmacy/inbox', label: 'Inquiries', icon: MessageSquare },
        { to: '/pharmacy/profile', label: 'Profile & verification', icon: ShieldCheck },
      ],
    });
  }
  if (hasRole(me, 'admin', 'reviewer')) {
    const items: NavItem[] = [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/medicines', label: 'Medicines', icon: Pill },
      { to: '/admin/tips', label: 'Health tips', icon: HeartPulse },
    ];
    if (hasRole(me, 'admin')) {
      items.splice(1, 0, { to: '/admin/pharmacies', label: 'Verification', icon: ShieldCheck }, { to: '/admin/reports', label: 'Reports', icon: Flag });
      items.push(
        { to: '/admin/users', label: 'Users & roles', icon: Users },
        { to: '/admin/settings', label: 'Trial & settings', icon: CreditCard },
        { to: '/admin/logs', label: 'SMS/USSD logs', icon: Smartphone },
        { to: '/admin/audit', label: 'Audit log', icon: BarChart3 },
      );
    }
    groups.push({ title: t('nav.admin'), items });
  }
  groups.push({
    title: 'Account',
    items: [
      { to: '/app/billing', label: t('nav.billing'), icon: CreditCard },
      { to: '/app/settings', label: t('nav.settings'), icon: Settings },
      { to: '/simulator', label: t('nav.simulator'), icon: Smartphone },
    ],
  });
  return groups;
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const groups = useNavGroups();
  const logout = useLogout();
  const { t } = useTranslation();
  return (
    <nav aria-label="App" className="flex h-full flex-col gap-5 overflow-y-auto px-3 pb-6">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 pb-1.5 text-xs font-bold text-muted">{g.title}</p>
          <ul className="grid gap-0.5">
            {g.items.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  end={it.end}
                  onClick={onNavigate}
                  className={({ isActive }) => cx('flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 font-brand text-[15px] font-extrabold', isActive ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-transparent text-ink hover:bg-slate-100')}
                >
                  <it.icon className="size-[18px]" aria-hidden />
                  {it.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button onClick={() => void logout()} className="mt-auto flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold text-muted hover:bg-slate-100 hover:text-ink">
        <LogOut className="size-[18px]" aria-hidden /> {t('nav.signOut')}
      </button>
    </nav>
  );
}

/**
 * Phone tab bar: up to five destinations, always with text labels (icons alone are hard to learn).
 * Inside the pharmacy or admin sections it shows that section's pages instead of the patient tabs.
 */
function TabBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data: me } = useMe();
  let items: NavItem[] = [
    { to: '/app', label: t('nav.home'), icon: Home, end: true },
    { to: '/app/reminders', label: t('nav.reminders'), icon: Bell },
    { to: '/find', label: 'Pharmacy', icon: Search },
    { to: '/app/health', label: t('nav.health'), icon: HeartPulse },
    { to: '/app/settings', label: 'Me', icon: User },
  ];
  if (pathname.startsWith('/pharmacy') && hasRole(me, 'pharmacy')) {
    items = [
      { to: '/pharmacy', label: 'Overview', icon: Store, end: true },
      { to: '/pharmacy/stock', label: 'Stock', icon: ClipboardList },
      { to: '/pharmacy/inbox', label: 'Inquiries', icon: MessageSquare },
      { to: '/pharmacy/profile', label: 'Profile', icon: ShieldCheck },
      { to: '/app', label: 'My health', icon: Home, end: true },
    ];
  } else if (pathname.startsWith('/admin') && hasRole(me, 'admin', 'reviewer')) {
    items = [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      ...(hasRole(me, 'admin') ? [{ to: '/admin/pharmacies', label: 'Verify', icon: ShieldCheck }] : []),
      { to: '/admin/medicines', label: 'Medicines', icon: Pill },
      { to: '/admin/tips', label: 'Tips', icon: HeartPulse },
      { to: '/app', label: 'My health', icon: Home, end: true },
    ];
  }
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t-2 border-border bg-white md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => (
          <li key={it.to}>
            <NavLink
              to={it.to}
              end={it.end}
              className={({ isActive }) => cx('flex min-h-[64px] flex-col items-center justify-center gap-0.5 font-brand text-[11px] font-extrabold', isActive ? 'text-primary-700' : 'text-muted')}
            >
              {({ isActive }) => (
                <>
                  <span className={cx('grid h-9 w-12 place-items-center rounded-xl border-2 transition-colors', isActive ? 'border-primary-400 bg-primary-50' : 'border-transparent')}>
                    <it.icon className="size-6" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
                  </span>
                  {it.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <DemoBanner />
      <div className="mx-auto flex max-w-[1400px]">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-white md:flex">
          <div className="px-5 py-5">
            <BrandLink to="/app" size="sm" />
          </div>
          <SideNav />
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-white px-4 md:hidden">
            <BrandLink to="/app" size="sm" />
            <div className="flex items-center gap-1">
              <InstallAppButton />
              <button className="grid size-11 place-items-center rounded-xl" aria-expanded={open} aria-controls="app-drawer" onClick={() => setOpen(true)}>
                <Menu className="size-6" aria-hidden />
                <span className="sr-only">{t('nav.menu')}</span>
              </button>
            </div>
          </header>
          {open ? (
            <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="app-drawer">
              <button className="absolute inset-0 bg-slate-900/40" aria-label="Close menu" onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 right-0 flex w-[min(86vw,320px)] flex-col bg-white pt-4 shadow-[var(--shadow-float)]">
                <div className="flex items-center justify-between px-5 pb-4">
                  <Wordmark size="sm" />
                  <button className="grid size-11 place-items-center rounded-xl" onClick={() => setOpen(false)}>
                    <X className="size-6" aria-hidden />
                    <span className="sr-only">{t('actions.close')}</span>
                  </button>
                </div>
                <SideNav onNavigate={() => setOpen(false)} />
              </div>
            </div>
          ) : null}
          <main id="main" tabIndex={-1} key={pathname} className="fade-in px-4 pb-28 pt-4 outline-none sm:px-6 sm:pt-6 md:pb-12 lg:px-8">
            {children ?? <Outlet />}
          </main>
        </div>
      </div>
      <TabBar />
    </div>
  );
}

export function HealthDisclaimer() {
  const { data } = useConfig();
  return (
    <p className="mt-8 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      {data?.healthDisclaimer ?? 'MEDIMATE does not diagnose or replace a health professional.'}
    </p>
  );
}

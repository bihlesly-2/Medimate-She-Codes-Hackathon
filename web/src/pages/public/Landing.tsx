import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BellRing, Check, ChevronDown, Droplets, Footprints, MapPin, MessageSquareText, Pill, Search, ShieldCheck, Smartphone } from 'lucide-react';
import { InstallAppButton } from '../../components/install';
import { Button, Input, LinkButton, cx } from '../../components/ui';
import { useConfig, useLogout, useMe } from '../../lib/auth';

/** Illustration of the three daily goals, built from the real app's own building blocks. */
function GoalsIllustration() {
  const tiles = [
    { icon: Pill, bg: 'bg-primary-600', edge: '#0a2f57', label: '08:00 Metformin', badge: 'Taken', rotate: '-rotate-3' },
    { icon: Droplets, bg: 'bg-primary-400', edge: '#0657a8', label: 'Water', badge: '1.5 of 2 L', rotate: 'rotate-2' },
    { icon: Footprints, bg: 'bg-secondary-600', edge: '#0e4f22', label: 'Steps', badge: '4,500 of 6,000', rotate: '-rotate-1' },
  ];
  return (
    <div className="relative mx-auto grid w-full max-w-[320px] gap-3" aria-hidden>
      {tiles.map((t, i) => (
        <div key={t.label} className={cx('slide-up card-3d flex items-center gap-3 rounded-2xl bg-white p-3', t.rotate)} style={{ animationDelay: `${i * 120}ms` }}>
          <span className={cx('grid size-12 shrink-0 place-items-center rounded-xl text-white', t.bg)} style={{ boxShadow: `0 3px 0 ${t.edge}` }}>
            <t.icon className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-brand text-[15px] font-extrabold text-ink">{t.label}</span>
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2 py-0.5 text-xs font-bold text-secondary-700">
              {i === 0 ? <Check className="size-3.5" /> : null}
              {t.badge}
            </span>
          </span>
        </div>
      ))}
      <span className="pop absolute -right-2 -top-4 inline-flex items-center gap-1 rounded-full bg-[#fff4e0] px-3 py-1 font-brand text-sm font-extrabold text-[#b25e00] shadow-[0_3px_0_#f2d3a0]" style={{ animationDelay: '500ms' }}>
        🔥 7-day streak
      </span>
    </div>
  );
}

const FAQ: [string, string][] = [
  ['Is MEDIMATE a pharmacy or a doctor?', 'No. It helps you find pharmacies and keep track of your own medicines. It never diagnoses, recommends medicines or changes doses. Ask a pharmacist or health worker for advice.'],
  ['Can I trust the prices and stock?', 'They are what each verified pharmacy last reported, with the time of the report. Anything older than 48 hours is marked as possibly out of date. Call before you travel.'],
  ['I only have a basic phone.', 'Your account also works by SMS and by USSD. Try both in the simulator.'],
  ['Who can see my health information?', 'You, and anyone you invite as a caretaker, limited to what you choose. Pharmacies only see the questions you send them.'],
];

export default function Landing() {
  const nav = useNavigate();
  const { data: config } = useConfig();
  const me = useMe();
  const logout = useLogout();
  const [q, setQ] = useState('');
  const trial = config?.trialDays ?? 30;

  return (
    <div className="bg-bg">
      {/* Welcome */}
      <section className="mx-auto grid max-w-5xl gap-8 px-4 pb-10 pt-8 md:grid-cols-2 md:items-center md:py-16">
        <div className="text-center md:text-left">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-sm font-bold text-primary-700">
            <MapPin className="size-4" aria-hidden /> Made in Buea, Cameroon
          </p>
          <h1 className="mt-4 text-[34px] leading-[1.1] text-ink sm:text-5xl">
            Medicines on time.
            <br />
            <span className="text-secondary-600">Health on track.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[17px] text-muted md:mx-0">
            Reminders that pop up on your phone, water and steps goals, and the nearest verified pharmacy with today’s price. Works on basic phones too, by SMS and USSD.
          </p>
          <div className="mx-auto mt-7 grid max-w-sm gap-3 md:mx-0">
            {me.data ? (
              <>
                <LinkButton to="/app" variant="green" size="lg">
                  Continue as {me.data.displayName?.split(' ')[0] ?? 'me'}
                </LinkButton>
                <button type="button" onClick={() => void logout()} className="min-h-11 text-sm font-bold text-primary-700 underline underline-offset-4">
                  Not you? Sign out and use another account
                </button>
              </>
            ) : (
              <>
                <LinkButton to="/login?mode=signup" variant="green" size="lg">
                  Get started free
                </LinkButton>
                <LinkButton to="/login" variant="outline" size="lg">
                  I already have an account
                </LinkButton>
              </>
            )}
            <InstallAppButton size="md" className="w-full" />
          </div>
          <p className="mt-3 text-sm text-muted">{trial} days of everything free. No card needed.</p>
        </div>
        <GoalsIllustration />
      </section>

      {/* Find without an account */}
      <section className="mx-auto max-w-5xl px-4 pb-10" aria-labelledby="find-h">
        <div className="card-3d rounded-[var(--radius-card)] bg-white p-5">
          <h2 id="find-h" className="flex items-center gap-2 text-xl">
            <Search className="size-5 text-primary-600" aria-hidden /> Need a medicine now?
          </h2>
          <p className="mt-1 text-sm text-muted">No account needed. See which verified pharmacy last reported it, at what price.</p>
          <form
            className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              nav(q.trim() ? `/find?q=${encodeURIComponent(q.trim())}` : '/find');
            }}
          >
            <label className="sr-only" htmlFor="hero-q">
              Medicine
            </label>
            <Input id="hero-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. paracetamol" className="min-h-12" />
            <Button type="submit" icon={Search}>
              Search
            </Button>
          </form>
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto max-w-5xl px-4 pb-10" aria-labelledby="get-h">
        <h2 id="get-h" className="mb-4 text-2xl">
          Your daily health buddy
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: BellRing, color: 'bg-primary-600', edge: '#0a2f57', title: 'Reminders that pop up', body: 'A notification at each time on your prescription. Tap Taken and keep your streak.' },
            { icon: Droplets, color: 'bg-primary-400', edge: '#0657a8', title: 'Water and steps goals', body: 'Set your own targets, log in one tap and watch the day fill up.' },
            { icon: ShieldCheck, color: 'bg-secondary-600', edge: '#0e4f22', title: 'Family can help', body: 'Invite a caretaker. If a dose is not confirmed, they get a gentle alert.' },
          ].map((f) => (
            <div key={f.title} className="card-3d rounded-[var(--radius-card)] bg-white p-4">
              <span className={cx('grid size-12 place-items-center rounded-xl text-white', f.color)} style={{ boxShadow: `0 3px 0 ${f.edge}` }}>
                <f.icon className="size-6" aria-hidden />
              </span>
              <h3 className="mt-3 text-lg">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Basic phones */}
      <section className="mx-auto max-w-5xl px-4 pb-10" aria-labelledby="phones-h">
        <div className="card-3d grid gap-4 rounded-[var(--radius-card)] bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 id="phones-h" className="flex items-center gap-2 text-xl">
              <Smartphone className="size-5 text-secondary-600" aria-hidden /> No smartphone? No problem.
            </h2>
            <p className="mt-1 text-sm text-muted">
              Send <span className="font-mono font-bold text-ink">FIND paracetamol</span> or <span className="font-mono font-bold text-ink">TAKEN</span> by SMS, or dial {config?.ussdCode ?? '*123#'} for the menu. Same account, same reminders.
            </p>
          </div>
          <LinkButton to="/simulator" variant="outline" icon={MessageSquareText}>
            Try SMS and USSD
          </LinkButton>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-5xl px-4 pb-12" aria-labelledby="faq-h">
        <h2 id="faq-h" className="mb-4 text-2xl">
          Questions
        </h2>
        <div className="card-3d divide-y-2 divide-slate-100 overflow-hidden rounded-[var(--radius-card)] bg-white">
          {FAQ.map(([qq, a]) => (
            <details key={qq} className="group px-4 py-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-brand font-extrabold text-ink">
                {qq}
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          MEDIMATE does not diagnose or replace a health worker. <Link to="/safety" className="underline">Safety</Link>
        </p>
      </section>
    </div>
  );
}

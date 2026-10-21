import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check, Search, Smartphone, X } from 'lucide-react';
import { Button, Input, LinkButton } from '../../components/ui';
import { useConfig } from '../../lib/auth';

/** A real exchange from the SMS engine (demo data), shown on a basic-phone screen. */
function SmsExample() {
  return (
    <figure className="mx-auto w-full max-w-[320px]">
      <div className="rounded-[26px] border-[6px] border-slate-800 bg-slate-800 p-2">
        <div className="space-y-2 rounded-2xl bg-[#d7ead3] p-3 font-mono text-[12.5px] leading-snug text-slate-900">
          <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-slate-800 px-2.5 py-1.5 text-[#d7ead3]">FIND paracetamol 500, Molyko</p>
          <p className="w-fit max-w-[92%] rounded-lg bg-white/80 px-2.5 py-1.5">
            Paracetamol 500 mg tablet, last reported: 1) Demo Pharmacy Molyko [MOL1] In stock 500 XAF, 2 h ago. CONTACT &lt;code&gt; to ask. -MEDIMATE
          </p>
          <p className="ml-auto w-fit rounded-lg bg-slate-800 px-2.5 py-1.5 text-[#d7ead3]">TAKEN</p>
          <p className="w-fit max-w-[92%] rounded-lg bg-white/80 px-2.5 py-1.5">Recorded as taken (R7K2). Thank you. -MEDIMATE</p>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-muted">Real replies from the MEDIMATE SMS engine, using demo data.</figcaption>
    </figure>
  );
}

function UssdMenu({ code }: { code: string }) {
  return (
    <div className="w-full max-w-[260px] rounded-[22px] border-[5px] border-slate-700 bg-slate-700 p-2">
      <p className="pb-1 text-center font-mono text-[10px] text-slate-300">{code}</p>
      <pre className="rounded-xl bg-[#d7ead3] p-3 font-mono text-[12.5px] leading-snug text-slate-900">
        {'Welcome to MEDIMATE\n1 Find medicine/prices\n2 My reminders\n3 Log health\n4 Contact pharmacy\n5 Health tips\n6 My account'}
      </pre>
    </div>
  );
}

const COMMANDS: [string, string][] = [
  ['FIND paracetamol, Molyko', 'Pharmacies that reported it, with stock and when'],
  ['PRICE amoxicillin', 'The same list sorted by price'],
  ['INFO paracetamol', 'Reviewed medicine information, when available'],
  ['TAKEN  /  SKIP', 'Answer a medicine reminder'],
  ['BP 120/80', 'Save a blood pressure reading'],
  ['WATER 2 GLASSES', 'Log water (a glass is 250 ml)'],
  ['STOP', 'Stop routine messages'],
];

export default function Landing() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { data: config } = useConfig();
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const trial = config?.trialDays ?? 30;

  const faqs: [string, string][] = [
    ['Is MEDIMATE a pharmacy or a doctor?', 'No. It helps you find pharmacies and keep track of your own medicines. It does not diagnose, recommend medicines or change doses. Ask a pharmacist or health worker for advice.'],
    ['Can I trust the prices and stock?', 'They are what each verified pharmacy last reported, with the time of the report. Anything older than 48 hours is marked as possibly out of date. Call the pharmacy before you travel.'],
    ['What does it cost?', `New accounts get ${trial} days of everything free. After that, finding pharmacies, comparing prices, medicine information and messaging pharmacies stay free. Reminders and health logs need Premium, paid with MTN MoMo or Orange Money.`],
    ['I only have a basic phone.', `You can register and use the main features by SMS (to ${config?.smsShortCode ?? 'the MEDIMATE number'}) or by dialling ${config?.ussdCode ?? 'the USSD code'}. Both are placeholders until an operator connects them; try them in the simulator for now.`],
    ['Who can see my health information?', 'You, and anyone you invite as a caretaker, limited to the categories you choose. Pharmacies only see the questions you send them.'],
  ];

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-8 md:grid-cols-[1.25fr_1fr] md:items-center md:py-16">
          <div>
            <h1 className="text-[30px] font-bold leading-[1.15] text-ink sm:text-[44px]">{t('landing.title')}</h1>
            <p className="mt-4 max-w-xl text-[17px] text-muted">{t('landing.lead')}</p>
            <form
              className="mt-6 grid gap-2 sm:grid-cols-[1.3fr_1fr_auto]"
              role="search"
              aria-label="Find a medicine"
              onSubmit={(e) => {
                e.preventDefault();
                const p = new URLSearchParams();
                if (q.trim()) p.set('q', q.trim());
                if (area.trim()) p.set('area', area.trim());
                nav(`/find?${p}`);
              }}
            >
              <label className="sr-only" htmlFor="hero-q">Medicine</label>
              <Input id="hero-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Medicine, e.g. paracetamol" className="min-h-12" />
              <label className="sr-only" htmlFor="hero-area">Area or town</label>
              <Input id="hero-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area, e.g. Molyko" className="min-h-12" />
              <Button type="submit" size="lg" icon={Search}>
                {t('landing.ctaFind')}
              </Button>
            </form>
            <p className="mt-4 text-sm text-muted">
              Or <Link to="/find" className="font-semibold text-primary-700 underline underline-offset-2">browse all verified pharmacies</Link>. No account needed.
            </p>
          </div>
          <SmsExample />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold text-ink">
          {t('landing.howTitle')}
        </h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
          {[t('landing.how1'), t('landing.how2'), t('landing.how3')].map((s, i) => (
            <li key={i} className="flex gap-4 md:block">
              <span className="text-3xl font-bold leading-none text-primary-600 md:text-4xl">{i + 1}</span>
              <p className="text-[16px] text-ink md:mt-3">{s}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton to="/login" variant="green" size="lg">
            {t('landing.ctaStart')}
          </LinkButton>
          <span className="self-center text-sm text-muted">{trial} days of everything, then pharmacy search stays free.</span>
        </div>
      </section>

      {/* SMS and USSD */}
      <section className="border-y border-border bg-white" aria-labelledby="channels">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 id="channels" className="text-2xl font-bold text-ink">
              {t('landing.channelsTitle')}
            </h2>
            <p className="mt-2 max-w-xl text-muted">{t('landing.channelsLead')}</p>
            <table className="mt-6 w-full text-left text-[15px]">
              <caption className="sr-only">SMS commands</caption>
              <thead className="sr-only">
                <tr>
                  <th>You send</th>
                  <th>You get</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-y border-border">
                {COMMANDS.map(([cmd, what]) => (
                  <tr key={cmd} className="align-top">
                    <td className="whitespace-nowrap py-3 pr-4 font-mono text-[14px] font-semibold text-ink">{cmd}</td>
                    <td className="py-3 text-muted">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm">
              <Link to="/simulator" className="inline-flex items-center gap-1.5 font-semibold text-primary-700 underline underline-offset-2">
                <Smartphone className="size-4" aria-hidden /> Try it in the browser simulator
              </Link>
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-3">
            <UssdMenu code={config?.ussdCode ?? '*123#'} />
            <p className="text-center text-xs text-muted">The USSD menu. Press 0 to go back, 00 for the start.</p>
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="safety">
        <h2 id="safety" className="text-2xl font-bold text-ink">
          {t('landing.safetyTitle')}
        </h2>
        <ul className="mt-5 grid gap-x-10 gap-y-4 md:grid-cols-2">
          {[t('landing.safety1'), t('landing.safety2'), t('landing.safety3'), t('landing.safety4')].map((s) => (
            <li key={s} className="flex gap-3 text-[16px]">
              <Check className="mt-1 size-5 shrink-0 text-secondary-600" aria-hidden />
              {s}
            </li>
          ))}
          <li className="flex gap-3 text-[16px]">
            <X className="mt-1 size-5 shrink-0 text-danger" aria-hidden />
            It is not an emergency service. If someone is very unwell, go to the nearest health facility.
          </li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-white" aria-labelledby="faq">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h2 id="faq" className="text-2xl font-bold text-ink">
            {t('landing.faqTitle')}
          </h2>
          <div className="mt-5 divide-y divide-border border-y border-border">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group py-1">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink">
                  {question}
                  <span className="text-xl text-primary-600 group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="pb-4 text-muted">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

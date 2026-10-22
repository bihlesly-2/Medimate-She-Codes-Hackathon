import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellRing, Check, Droplets, Footprints, HeartPulse, MapPin, MessageSquareText } from 'lucide-react';
import { LogoMark } from '../../components/brand';
import { celebrate } from '../../components/celebrate';
import { Button, Input, Notice, cx, errorMessage } from '../../components/ui';
import { patch, post } from '../../lib/api';
import { useConfig, useMe } from '../../lib/auth';
import { enablePush, pushSupport } from '../../lib/push';
import { UI_LANGUAGES, setUiLanguage } from '../../i18n';

const WATER = [1500, 2000, 2500];
const STEPS = [3000, 6000, 8000];

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-b-4 px-4 text-left font-brand text-[17px] font-extrabold transition-colors active:translate-y-[2px] active:border-b-2',
        selected ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border bg-white text-ink hover:bg-sky',
      )}
    >
      {children}
      {selected ? <Check className="ml-auto size-5 shrink-0" aria-hidden /> : null}
    </button>
  );
}

function Consent({ on, onChange, icon: Icon, title, body }: { on: boolean; onChange: (v: boolean) => void; icon: typeof HeartPulse; title: string; body: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx('card-3d flex w-full items-start gap-3 rounded-2xl p-4 text-left transition-colors', on ? 'border-secondary-400 bg-secondary-50' : 'bg-white')}
    >
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', on ? 'bg-secondary-600 text-white' : 'bg-slate-100 text-muted')}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-brand text-[17px] font-extrabold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{body}</span>
      </span>
      <span className={cx('mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors', on ? 'bg-secondary-600' : 'bg-slate-300')} aria-hidden>
        <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
      </span>
    </button>
  );
}

/**
 * First-run setup, one question per screen. Data use is explained before anything is collected,
 * every consent is separate, and only the name is required.
 */
export default function Onboarding() {
  const { data: me } = useMe();
  const { data: config } = useConfig();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(me?.displayName ?? '');
  const [area, setArea] = useState(me?.area ?? '');
  const [language, setLanguage] = useState(me?.language ?? 'en');
  const [water, setWater] = useState(me?.waterTargetMl ?? 2000);
  const [steps, setSteps] = useState(me?.stepGoal ?? 6000);
  const [health, setHealth] = useState(true);
  const [sms, setSms] = useState(Boolean(me?.phone));
  const [pushState, setPushState] = useState<'idle' | 'enabled' | 'denied' | 'unsupported'>('idle');
  const support = pushSupport();

  const save = useMutation({
    mutationFn: async () => {
      await patch('/me/profile', { displayName: name.trim() || undefined, area: area.trim() || null, language, waterTargetMl: water, stepGoal: steps, completeOnboarding: true });
      await post('/me/consents', { purpose: 'health_data', granted: health });
      await post('/me/consents', { purpose: 'sms_messages', granted: sms });
    },
    onSuccess: async () => {
      setUiLanguage(language);
      celebrate();
      await qc.invalidateQueries({ queryKey: ['me'] });
      setStep(Number.MAX_SAFE_INTEGER);
    },
  });
  const push = useMutation({
    mutationFn: () => (config?.vapidPublicKey ? enablePush(config.vapidPublicKey) : Promise.resolve('unsupported' as const)),
    onSuccess: (r) => setPushState(r),
    onError: () => setPushState('unsupported'),
  });

  const screens: { title: string; lead?: string; body: ReactNode; canNext: boolean }[] = [
    {
      title: 'Hi! What should we call you?',
      lead: 'Just a first name is fine.',
      canNext: name.trim().length > 0,
      body: <Input autoFocus aria-label="Your name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" className="min-h-14 text-lg" />,
    },
    {
      title: 'Where do you live?',
      lead: 'We show pharmacies near you first. A neighbourhood is enough.',
      canNext: true,
      body: (
        <div className="grid gap-3">
          <Input aria-label="Area or town" maxLength={80} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Molyko, Buea" className="min-h-14 text-lg" />
          <div className="flex flex-wrap gap-2">
            {['Molyko', 'Great Soppo', 'Mile 17', 'Bonduma'].map((a) => (
              <button key={a} type="button" onClick={() => setArea(a)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border-2 border-b-4 border-border bg-white px-3 text-sm font-bold">
                <MapPin className="size-4 text-primary-600" aria-hidden /> {a}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Which language?',
      canNext: true,
      body: (
        <div className="grid gap-3">
          {UI_LANGUAGES.map((l) => (
            <Choice key={l.code} selected={language === l.code} onClick={() => setLanguage(l.code)}>
              {l.label}
              {l.status !== 'Complete' ? <span className="text-sm font-semibold text-muted">(shows English for now)</span> : null}
            </Choice>
          ))}
        </div>
      ),
    },
    {
      title: 'Pick your daily goals',
      lead: 'Needs differ from person to person. You can change these any time.',
      canNext: true,
      body: (
        <div className="grid gap-5">
          <div>
            <p className="mb-2 flex items-center gap-2 font-brand font-extrabold text-ink">
              <Droplets className="size-5 text-primary-500" aria-hidden /> Water
            </p>
            <div className="grid grid-cols-3 gap-2">
              {WATER.map((w) => (
                <Choice key={w} selected={water === w} onClick={() => setWater(w)}>
                  {w / 1000} L
                </Choice>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 font-brand font-extrabold text-ink">
              <Footprints className="size-5 text-secondary-600" aria-hidden /> Steps
            </p>
            <div className="grid grid-cols-3 gap-2">
              {STEPS.map((n) => (
                <Choice key={n} selected={steps === n} onClick={() => setSteps(n)}>
                  {n.toLocaleString()}
                </Choice>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Your permissions',
      lead: 'Each one is separate and you can change it later in Me.',
      canNext: true,
      body: (
        <div className="grid gap-3">
          <Consent on={health} onChange={setHealth} icon={HeartPulse} title="Keep my health log" body="Needed for reminders, water, steps and readings. Only you, and people you invite, can see it." />
          <Consent on={sms} onChange={setSms} icon={MessageSquareText} title="Text me reminders" body="Short SMS that never name your medicine. Reply STOP any time." />
        </div>
      ),
    },
    {
      title: 'Turn on reminders',
      lead: 'MEDIMATE can pop up a reminder at each time on your prescription, even when the app is closed.',
      canNext: true,
      body: (
        <div className="grid gap-3">
          <div className="card-3d flex items-center gap-3 rounded-2xl bg-white p-4">
            <span className="grid size-12 place-items-center rounded-xl bg-primary-600 text-white shadow-[0_3px_0_#0a2f57]">
              <BellRing className="size-6" aria-hidden />
            </span>
            <span>
              <span className="block font-brand font-extrabold text-ink">08:00 · Time for your medicine</span>
              <span className="text-sm text-muted">Tap to answer Taken or Skip</span>
            </span>
          </div>
          {pushState === 'enabled' ? (
            <Notice tone="success">Notifications are on.</Notice>
          ) : pushState === 'denied' ? (
            <Notice tone="warning">Notifications are blocked. You can allow them in your browser settings for this site.</Notice>
          ) : support === 'ios-install' ? (
            <Notice>On iPhone, first add MEDIMATE to your home screen (Share, then Add to Home Screen), then turn on notifications in Me.</Notice>
          ) : support === 'unsupported' || pushState === 'unsupported' ? (
            <Notice>This browser cannot show notifications. Reminders still appear in the app and by SMS.</Notice>
          ) : (
            <Button variant="primary" size="lg" icon={BellRing} loading={push.isPending} onClick={() => push.mutate()}>
              Allow notifications
            </Button>
          )}
        </div>
      ),
    },
  ];
  const STEPS_TOTAL = screens.length;
  const last = step === STEPS_TOTAL - 1;

  if (step >= STEPS_TOTAL) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="pop grid size-28 place-items-center rounded-[32px] bg-white shadow-[0_6px_0_var(--color-border)]">
          <LogoMark size={84} />
        </span>
        <h1 className="slide-up mt-6 text-3xl">You’re all set, {name.trim().split(' ')[0] || 'friend'}!</h1>
        <p className="slide-up mt-2 text-muted">Add your first medicine from your prescription and we’ll remind you on time.</p>
        <div className="mt-8 grid w-full gap-3">
          <Button variant="green" size="lg" onClick={() => nav('/app/medicines/new', { replace: true })}>
            Add my first medicine
          </Button>
          <Button variant="outline" size="lg" onClick={() => nav('/app', { replace: true })}>
            Go to my day
          </Button>
        </div>
      </div>
    );
  }

  const screen = screens[step]!;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-6 pt-4">
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} className="grid size-10 place-items-center rounded-xl text-muted hover:bg-slate-100" aria-label="Back">
            <ArrowLeft className="size-6" aria-hidden />
          </button>
        ) : (
          <LogoMark size={36} />
        )}
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS_TOTAL} aria-valuenow={step + 1} aria-label="Setup progress">
          <div className="h-full rounded-full bg-secondary-400 transition-[width] duration-500" style={{ width: `${((step + 1) / STEPS_TOTAL) * 100}%` }} />
        </div>
      </div>
      <div key={step} className="slide-up mt-8 flex-1">
        <h1 className="text-[26px] leading-tight">{screen.title}</h1>
        {screen.lead ? <p className="mt-2 text-[15px] text-muted">{screen.lead}</p> : null}
        <div className="mt-6">{screen.body}</div>
      </div>
      {save.isError ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
      <div className="mt-6 grid gap-2">
        <Button
          variant="green"
          size="lg"
          disabled={!screen.canNext}
          loading={save.isPending}
          onClick={() => (last ? save.mutate() : setStep(step + 1))}
        >
          {last ? 'Finish' : 'Continue'}
        </Button>
        {last && pushState !== 'enabled' ? (
          <Button variant="ghost" onClick={() => save.mutate()}>
            Not now
          </Button>
        ) : null}
      </div>
    </div>
  );
}

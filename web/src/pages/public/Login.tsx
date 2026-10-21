import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, Phone } from 'lucide-react';
import { LogoMark } from '../../components/brand';
import { Button, Field, Input, Notice, Tabs, errorMessage } from '../../components/ui';
import { api, post } from '../../lib/api';
import { useConfig } from '../../lib/auth';
import { emailSignIn, emailSignUp, firebaseMessage, googleSignIn, resetPassword } from '../../lib/firebase';
import type { Me } from '../../lib/types';

const DEMO = [
  ['600000001', 'Ama', 'patient, trial active'],
  ['600000002', 'Ben', 'patient, trial ended'],
  ['600000003', 'Clara', 'caretaker for Ama'],
  ['600000004', 'Dan', 'pharmacist, Molyko'],
  ['600000005', 'Eve', 'admin'],
  ['600000006', 'Femi', 'clinical reviewer'],
  ['600000007', 'Gina', 'pharmacist, Great Soppo'],
] as const;

function homeFor(me: Me) {
  if (!me.onboarded) return '/app/onboarding';
  if (me.roles.includes('admin') || me.roles.includes('reviewer')) return '/admin';
  if (me.roles.includes('pharmacy')) return '/pharmacy';
  return '/app';
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: config } = useConfig();
  const firebase = config?.firebase ?? null;
  const [tab, setTab] = useState<'email' | 'phone'>(params.get('method') === 'phone' ? 'phone' : 'email');
  const method = firebase ? tab : 'phone';

  const finish = async () => {
    const { user } = await api<{ user: Me | null }>('/auth/me');
    qc.setQueryData(['me'], user);
    const next = params.get('next');
    nav(user && !user.onboarded ? '/app/onboarding' : next && next.startsWith('/') && !next.startsWith('//') ? next : user ? homeFor(user) : '/app', { replace: true });
  };

  // ---- email / Google (Firebase)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const emailAuth = useMutation({
    mutationFn: async (kind: 'email' | 'google') => {
      if (!firebase) throw new Error('Email sign-in is not set up yet.');
      const idToken = kind === 'google' ? await googleSignIn(firebase) : mode === 'signup' ? await emailSignUp(firebase, email, password) : await emailSignIn(firebase, email, password);
      await post('/auth/firebase', { idToken });
    },
    onSuccess: finish,
  });
  const reset = useMutation({
    mutationFn: () => resetPassword(firebase!, email),
    onSuccess: () => setResetSent(true),
  });

  // ---- phone code
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState('');
  const request = useMutation({
    mutationFn: (p: string) => post<{ message: string; devCode?: string }>('/auth/otp/request', { phone: p }),
    onSuccess: (r) => {
      setSentMsg(r.message);
      setDevCode(r.devCode ?? null);
      setStep('code');
    },
  });
  const verify = useMutation({ mutationFn: () => post('/auth/otp/verify', { phone, code }), onSuccess: finish });

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <div className="flex items-center gap-3">
        <LogoMark size={44} />
        <div>
          <h1 className="text-2xl font-bold">{t('auth.title')}</h1>
          <p className="text-sm text-muted">{t('auth.lead')}</p>
        </div>
      </div>

      {firebase ? (
        <div className="mt-6">
          <Tabs
            label="Sign-in method"
            value={method}
            onChange={setTab}
            items={[
              { value: 'email', label: 'Email' },
              { value: 'phone', label: 'Phone code' },
            ]}
          />
        </div>
      ) : null}

      {method === 'email' && firebase ? (
        <div className="mt-6 grid gap-4">
          <Button variant="outline" size="lg" className="w-full" onClick={() => emailAuth.mutate('google')} disabled={emailAuth.isPending}>
            <GoogleMark /> Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
          </div>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              emailAuth.mutate('email');
            }}
          >
            <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
              {(id, d) => (
                <Input
                  id={id}
                  aria-describedby={d}
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={mode === 'signup' ? 8 : undefined}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
            {emailAuth.isError ? <Notice tone="danger">{firebaseMessage(emailAuth.error)}</Notice> : null}
            {resetSent ? <Notice tone="success">If an account uses {email}, a password reset email is on its way.</Notice> : null}
            <Button type="submit" size="lg" icon={Mail} loading={emailAuth.isPending && emailAuth.variables === 'email'}>
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" className="font-semibold text-primary-700 underline underline-offset-2" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </button>
            {mode === 'signin' ? (
              <button type="button" className="text-muted underline underline-offset-2 disabled:opacity-50" disabled={!email || reset.isPending} onClick={() => reset.mutate()}>
                Forgot password?
              </button>
            ) : null}
          </div>
          {reset.isError ? <Notice tone="danger">{firebaseMessage(reset.error)}</Notice> : null}
          <p className="text-xs text-muted">You can add your phone number later in Settings to get SMS reminders and use SMS or USSD with the same account.</p>
        </div>
      ) : (
        <div className="mt-6">
          {step === 'phone' ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                request.mutate(phone);
              }}
            >
              <Field label={t('auth.phone')} hint={t('auth.phoneHint')}>
                {(id, d) => <Input id={id} aria-describedby={d} type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6XX XX XX XX" />}
              </Field>
              {request.isError ? <Notice tone="danger">{errorMessage(request.error)}</Notice> : null}
              <Button type="submit" size="lg" icon={Phone} loading={request.isPending}>
                {t('auth.sendCode')}
              </Button>
            </form>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                verify.mutate();
              }}
            >
              <p className="text-sm text-muted">{sentMsg}</p>
              {devCode ? (
                <div className="rounded-xl border border-amber-300 bg-warning-bg p-3 text-sm">
                  <p className="font-bold text-[#6b3a00]">
                    {t('auth.devCode')}: <span className="font-mono text-lg tracking-widest text-ink">{devCode}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#6b3a00]">{t('auth.devCodeNote')}</p>
                </div>
              ) : null}
              <Field label={t('auth.code')}>
                {(id) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="font-mono text-lg tracking-[0.4em]"
                  />
                )}
              </Field>
              {verify.isError ? <Notice tone="danger">{errorMessage(verify.error)}</Notice> : null}
              <Button type="submit" size="lg" icon={KeyRound} loading={verify.isPending} disabled={code.length !== 6}>
                {t('auth.verify')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setDevCode(null);
                }}
              >
                {t('auth.changeNumber')}
              </Button>
            </form>
          )}

          {config?.demoMode ? (
            <section className="mt-8" aria-labelledby="demo-h">
              <h2 id="demo-h" className="text-sm font-bold text-ink">
                Demo accounts
              </h2>
              <p className="text-xs text-muted">Made-up people with fictional numbers. Tap one, then send the code.</p>
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-white">
                {DEMO.map(([num, name, role]) => (
                  <li key={num}>
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left hover:bg-slate-50"
                      onClick={() => {
                        setPhone(num);
                        setStep('phone');
                      }}
                    >
                      <span>
                        <span className="font-semibold">{name}</span> <span className="text-sm text-muted">{role}</span>
                      </span>
                      <span className="font-mono text-xs text-muted">{num}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

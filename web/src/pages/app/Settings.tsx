import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, ChevronRight, CreditCard, Download, Globe, KeyRound, LogOut, Mail, Phone, ShieldCheck, Store, Trash2, User } from 'lucide-react';
import { Button, Card, Dialog, Field, Input, LinkButton, Notice, PageHeader, Select, SectionTitle, Textarea, Toggle, errorMessage, useToast } from '../../components/ui';
import { api, del, patch, post } from '../../lib/api';
import { hasRole, useConfig, useLogout, useMe } from '../../lib/auth';
import { UI_LANGUAGES, setUiLanguage } from '../../i18n';
import { dateTime } from '../../lib/format';
import { PushToggle } from './Notifications';

/** Email/Google (Firebase) and a verified phone number can both point at the same MEDIMATE account. */
function SignInMethods() {
  const { data: me } = useMe();
  const { data: config } = useConfig();
  const qc = useQueryClient();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [step, setStep] = useState<'idle' | 'phone' | 'code'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['me'] });
  const requestCode = useMutation({
    mutationFn: () => post<{ devCode?: string }>('/me/link/phone/request', { phone }),
    onSuccess: (r) => {
      setDevCode(r.devCode ?? null);
      setStep('code');
    },
  });
  const verifyCode = useMutation({
    mutationFn: () => post('/me/link/phone/verify', { phone, code }),
    onSuccess: () => {
      toast('Phone number added. You can now use SMS and USSD with this account.');
      setStep('idle');
      refresh();
    },
  });
  const linkEmail = useMutation({
    mutationFn: async (kind: 'google' | 'email') => {
      const fb = config!.firebase!;
      const { googleSignIn, emailSignIn, emailSignUp } = await import('../../lib/firebase');
      let idToken: string;
      if (kind === 'google') idToken = await googleSignIn(fb);
      else idToken = await emailSignIn(fb, email, password).catch(() => emailSignUp(fb, email, password));
      await post('/me/link/email', { idToken });
    },
    onSuccess: () => {
      toast('Email sign-in added.');
      setEmailOpen(false);
      refresh();
    },
  });
  if (!me) return null;
  return (
    <Card className="p-5">
      <SectionTitle>
        <span className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary-600" aria-hidden /> Sign-in methods
        </span>
      </SectionTitle>
      <div className="divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <Mail className="size-5 text-muted" aria-hidden />
            <div>
              <p className="font-semibold">Email or Google</p>
              <p className="text-sm text-muted">{me.hasEmailLogin ? `${me.email ?? 'Linked'}${me.emailVerified ? '' : ' (not verified yet)'}` : 'Not added'}</p>
            </div>
          </div>
          {!me.hasEmailLogin && config?.firebase ? (
            <Button size="sm" variant="outline" onClick={() => setEmailOpen((v) => !v)}>
              Add email
            </Button>
          ) : null}
        </div>
        {emailOpen && config?.firebase ? (
          <div className="grid gap-3 py-3">
            <Button variant="outline" onClick={() => linkEmail.mutate('google')} loading={linkEmail.isPending && linkEmail.variables === 'google'}>
              Use my Google account
            </Button>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" aria-label="Password (at least 8 characters)" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button onClick={() => linkEmail.mutate('email')} disabled={!email || password.length < 8} loading={linkEmail.isPending && linkEmail.variables === 'email'}>
              Add email and password
            </Button>
            {linkEmail.isError ? <Notice tone="danger">{errorMessage(linkEmail.error)}</Notice> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <Phone className="size-5 text-muted" aria-hidden />
            <div>
              <p className="font-semibold">Phone number</p>
              <p className="text-sm text-muted">{me.phone ?? 'Not added. Needed for SMS reminders, SMS and USSD.'}</p>
            </div>
          </div>
          {!me.phone && step === 'idle' ? (
            <Button size="sm" variant="outline" onClick={() => setStep('phone')}>
              Add phone
            </Button>
          ) : null}
        </div>
        {step !== 'idle' ? (
          <div className="grid gap-3 py-3">
            {step === 'phone' ? (
              <div className="flex gap-2">
                <Input type="tel" aria-label="Phone number" placeholder="6XX XX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button onClick={() => requestCode.mutate()} loading={requestCode.isPending} disabled={phone.length < 6}>
                  Send code
                </Button>
              </div>
            ) : (
              <>
                {devCode ? (
                  <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-[#6b3a00]">
                    Demo code for this fictional number: <strong className="font-mono">{devCode}</strong>
                  </p>
                ) : (
                  <p className="text-sm text-muted">We sent a 6-digit code by SMS.</p>
                )}
                <div className="flex gap-2">
                  <Input inputMode="numeric" aria-label="6-digit code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="font-mono tracking-[0.3em]" />
                  <Button onClick={() => verifyCode.mutate()} loading={verifyCode.isPending} disabled={code.length !== 6}>
                    Confirm
                  </Button>
                </div>
              </>
            )}
            {requestCode.isError ? <Notice tone="danger">{errorMessage(requestCode.error)}</Notice> : null}
            {verifyCode.isError ? <Notice tone="danger">{errorMessage(verifyCode.error)}</Notice> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default function Settings() {
  const { data: me } = useMe();
  const { data: config } = useConfig();
  const qc = useQueryClient();
  const toast = useToast();
  const logout = useLogout();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [dob, setDob] = useState('');
  const [language, setLanguage] = useState('en');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (!me) return;
    setName(me.displayName ?? '');
    setArea(me.area ?? '');
    setDob(me.dateOfBirth ?? '');
    setLanguage(me.language);
    setAllergies(me.allergies ?? '');
    setConditions(me.conditions ?? '');
  }, [me]);
  useEffect(() => {
    if (window.location.hash === '#consent') document.getElementById('consent')?.scrollIntoView();
  }, []);

  const save = useMutation({
    mutationFn: () => patch('/me/profile', { displayName: name, area: area || null, dateOfBirth: dob || null, language, allergies: allergies || null, conditions: conditions || null }),
    onSuccess: () => {
      setUiLanguage(language);
      toast('Profile saved.');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const consent = useMutation({
    mutationFn: (v: { purpose: string; granted: boolean }) => post('/me/consents', v),
    onSuccess: (_r, v) => {
      toast(v.granted ? 'Permission given.' : 'Permission withdrawn.');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const exportData = useMutation({
    mutationFn: async () => {
      const data = await api<unknown>('/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'medimate-my-data.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    onSuccess: () => toast('Your data was downloaded.'),
  });
  const deleteAccount = useMutation({
    mutationFn: () => del('/me', { confirm: 'DELETE' }),
    onSuccess: () => {
      qc.clear();
      window.location.assign('/');
    },
  });

  if (!me) return null;
  const c = me.consents;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Me" subtitle={`Signed in as ${me.email ?? me.phone ?? 'you'}`} />
      <div className="grid gap-5">
        <Card className="p-5">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <BellRing className="size-5 text-primary-600" aria-hidden /> Reminders on this phone
            </span>
          </SectionTitle>
          <p className="mb-3 text-sm text-muted">Pop-up notifications for each medicine time, plus a few friendly water and steps nudges.</p>
          <PushToggle />
        </Card>
        <SignInMethods />
        <Card className="p-5">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <User className="size-5 text-primary-600" aria-hidden /> Profile
            </span>
          </SectionTitle>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Name">{(id) => <Input id={id} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Area or town" optional>
              {(id) => <Input id={id} maxLength={80} value={area} onChange={(e) => setArea(e.target.value)} />}
            </Field>
            <Field label="Date of birth" optional hint="Used only to decide whether adult BMI applies.">
              {(id, d) => <Input id={id} aria-describedby={d} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />}
            </Field>
            <Field label="Language">
              {(id) => (
                <Select id={id} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {UI_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} ({l.status})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Allergies (self-reported)" optional hint="Not needed for pharmacy search. Shown only to you and in exports you choose.">
              {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} maxLength={500} value={allergies} onChange={(e) => setAllergies(e.target.value)} />}
            </Field>
            <Field label="Conditions (self-reported)" optional>
              {(id) => <Textarea id={id} rows={2} maxLength={500} value={conditions} onChange={(e) => setConditions(e.target.value)} />}
            </Field>
            <div className="sm:col-span-2">
              {save.isError ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
              <Button type="submit" loading={save.isPending}>
                Save profile
              </Button>
            </div>
          </form>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <Globe className="size-3.5" aria-hidden /> Time zone: {me.timezone}. French and Pidgin are placeholders until reviewed translations are added; the app shows English meanwhile.
          </p>
        </Card>

        <Card className="p-5" id="consent">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-secondary-600" aria-hidden /> Permissions
            </span>
          </SectionTitle>
          <div className="divide-y divide-border">
            <Toggle
              checked={!!c.health_data?.granted}
              onChange={(v) => consent.mutate({ purpose: 'health_data', granted: v })}
              label="Store my health information"
              description={c.health_data ? `Last changed ${dateTime(c.health_data.at)} via ${c.health_data.channel} (wording ${c.health_data.version})` : 'Needed for reminders, readings, water, steps and history.'}
            />
            <Toggle
              checked={!!c.sms_messages?.granted}
              onChange={(v) => consent.mutate({ purpose: 'sms_messages', granted: v })}
              label="Reminder SMS"
              description={c.sms_messages ? `Last changed ${dateTime(c.sms_messages.at)} via ${c.sms_messages.channel}. You can also send STOP.` : 'Routine reminders by SMS.'}
            />
          </div>
          <p className="mt-2 text-xs text-muted">Caretaker sharing is managed per person on the Caretakers page. Withdrawing health consent stops new health records; existing records stay until you delete them or your account.</p>
        </Card>

        <Card className="divide-y divide-border p-2">
          {[
            { to: '/app/billing', icon: CreditCard, label: 'Plan & payments' },
            { to: '/app/care', icon: ShieldCheck, label: 'Caretakers & sharing' },
            ...(hasRole(me, 'pharmacy') ? [] : [{ to: '/pharmacy/register', icon: Store, label: 'Register a pharmacy' }]),
          ].map((r) => (
            <LinkButton key={r.to} to={r.to} variant="ghost" className="w-full !justify-between !text-ink">
              <span className="flex items-center gap-3">
                <r.icon className="size-5 text-primary-600" aria-hidden /> {r.label}
              </span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </LinkButton>
          ))}
        </Card>

        <Card className="p-5">
          <SectionTitle>Your data</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={Download} loading={exportData.isPending} onClick={() => exportData.mutate()}>
              Download my data (JSON)
            </Button>
            <Button variant="outline" icon={LogOut} onClick={() => void logout()}>
              Sign out
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => setDelOpen(true)}>
              Delete my account
            </Button>
          </div>
          {config?.demoMode ? <p className="mt-2 text-xs text-muted">Demo accounts can be deleted too; reseeding restores them.</p> : null}
        </Card>
      </div>

      <Dialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Delete your account?"
        footer={
          <>
            <Button variant="outline" onClick={() => setDelOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={confirmText !== 'DELETE'} loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p>This deletes your profile, medicines, reminders, readings, logs, conversations and caretaker links. It cannot be undone. Download your data first if you want a copy.</p>
        <div className="mt-3">
          <Field label='Type "DELETE" to confirm'>{(id) => <Input id={id} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />}</Field>
        </div>
        {deleteAccount.isError ? (
          <div className="mt-3">
            <Notice tone="danger">{errorMessage(deleteAccount.error)}</Notice>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

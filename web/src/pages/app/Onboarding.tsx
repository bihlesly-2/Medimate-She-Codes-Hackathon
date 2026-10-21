import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Wordmark } from '../../components/brand';
import { Button, Card, Field, Input, Notice, Select, Toggle, errorMessage } from '../../components/ui';
import { patch, post } from '../../lib/api';
import { useConfig, useMe } from '../../lib/auth';
import { UI_LANGUAGES, setUiLanguage } from '../../i18n';

/** Explains data use BEFORE collecting it; every consent is separate and optional. */
export default function Onboarding() {
  const { data: me } = useMe();
  const { data: config } = useConfig();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState(me?.displayName ?? '');
  const [area, setArea] = useState(me?.area ?? '');
  const [language, setLanguage] = useState(me?.language ?? 'en');
  const [health, setHealth] = useState(true);
  const [sms, setSms] = useState(true);
  const save = useMutation({
    mutationFn: async () => {
      await patch('/me/profile', { displayName: name.trim() || undefined, area: area.trim() || null, language, completeOnboarding: true });
      await post('/me/consents', { purpose: 'health_data', granted: health });
      await post('/me/consents', { purpose: 'sms_messages', granted: sms });
    },
    onSuccess: async () => {
      setUiLanguage(language);
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/app', { replace: true });
    },
  });
  return (
    <div className="mx-auto max-w-2xl">
      <Wordmark tagline />
      <h1 className="mt-5 text-2xl font-bold">Welcome! Let’s set things up</h1>
      <p className="mt-1 text-sm text-muted">This takes a minute. Only your name is needed; everything else is optional and can be changed later.</p>
      <form
        className="mt-6 grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Card className="grid gap-4 p-5">
          <Field label="What should we call you?">{(id) => <Input id={id} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" />}</Field>
          <Field label="Your area or town" optional hint="Used to show nearby pharmacies first. You do not need to share an exact address.">
            {(id, d) => <Input id={id} aria-describedby={d} maxLength={80} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Molyko" />}
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
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <ShieldCheck className="size-5 text-secondary-600" aria-hidden /> Your permissions
          </h2>
          <p className="mt-1 text-sm text-muted">Each permission is separate. You can change them any time in Settings.</p>
          <div className="mt-3 divide-y divide-border">
            <Toggle
              checked={health}
              onChange={setHealth}
              label="Store my health information"
              description="Needed for reminders, readings, water, steps and history. Used only to show you your own information and what you choose to share."
            />
            <Toggle
              checked={sms}
              onChange={setSms}
              label="Send me reminder SMS"
              description={`Routine reminders by SMS. They never name your medicine or condition. Reply STOP any time.${config?.messagingLive ? '' : ' (In this demo, SMS are simulated.)'}`}
            />
          </div>
          <p className="mt-3 text-xs text-muted">Caretaker sharing is asked separately, only if you invite someone.</p>
        </Card>
        {save.isError ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
        <Button type="submit" size="lg" loading={save.isPending}>
          Continue to MEDIMATE
        </Button>
      </form>
    </div>
  );
}

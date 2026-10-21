import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CARE_CATEGORIES, type CareCategory } from '@medimate/shared';
import { ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Notice, PageHeader, QueryView, StatusBadge, Toggle, errorMessage, useToast } from '../../components/ui';
import { api, patch, post } from '../../lib/api';
import type { CareLink } from '../../lib/types';

export const CATEGORY_LABEL: Record<CareCategory, [string, string]> = {
  reminders: ['Reminder status', 'Whether today’s reminders were answered, and alerts when one is not confirmed.'],
  checkups: ['Checkups', 'Upcoming and recent checkups.'],
  vitals: ['Readings', 'Blood pressure, glucose, weight and other readings you log.'],
  activity: ['Water & steps', 'Daily totals for the last week.'],
  reactions: ['Reactions', 'Reactions you logged.'],
};

function CategoryPicker({ value, onChange }: { value: CareCategory[]; onChange: (v: CareCategory[]) => void }) {
  return (
    <div className="divide-y divide-border">
      {CARE_CATEGORIES.map((c) => (
        <Toggle key={c} checked={value.includes(c)} onChange={(on) => onChange(on ? [...value, c] : value.filter((x) => x !== c))} label={CATEGORY_LABEL[c][0]} description={CATEGORY_LABEL[c][1]} />
      ))}
    </div>
  );
}

function LinkCard({ l }: { l: CareLink }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [cats, setCats] = useState<CareCategory[]>(l.categories);
  const [detail, setDetail] = useState(l.alertDetail);
  const dirty = cats.join() !== l.categories.join() || detail !== l.alertDetail;
  const save = useMutation({
    mutationFn: () => patch(`/care/links/${l.id}`, { categories: cats, alertDetail: detail }),
    onSuccess: () => {
      toast('Sharing updated.');
      void qc.invalidateQueries({ queryKey: ['care', 'links'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const revoke = useMutation({
    mutationFn: () => post(`/care/links/${l.id}/revoke`),
    onSuccess: () => {
      toast('Access removed. They can no longer see your information.');
      void qc.invalidateQueries({ queryKey: ['care', 'links'] });
    },
  });
  const live = l.status === 'active' || l.status === 'pending';
  return (
    <Card as="li" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold">{l.person?.displayName ?? 'Invited person'}</p>
          <p className="text-sm text-muted">{l.person?.phone ?? l.invitedPhone}</p>
        </div>
        <StatusBadge status={l.status} label={l.status === 'pending' ? 'Waiting for them to accept' : undefined} />
      </div>
      {live ? (
        <>
          <div className="mt-3">
            <CategoryPicker value={cats} onChange={setCats} />
            <Toggle checked={detail} onChange={setDetail} label="Include medicine names in alerts" description="Off by default: alerts only say a reminder was not confirmed." />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
              Save sharing
            </Button>
            <Button size="sm" variant="danger" loading={revoke.isPending} onClick={() => confirm('Stop sharing with this person? This takes effect immediately.') && revoke.mutate()}>
              Stop sharing
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">This link is no longer active. They cannot see any of your information.</p>
      )}
    </Card>
  );
}

export default function Care() {
  const qc = useQueryClient();
  const toast = useToast();
  const links = useQuery({ queryKey: ['care', 'links'], queryFn: () => api<{ items: CareLink[] }>('/care/links') });
  const [phone, setPhone] = useState('');
  const [cats, setCats] = useState<CareCategory[]>(['reminders']);
  const [detail, setDetail] = useState(false);
  const invite = useMutation({
    mutationFn: () => post('/care/links', { phone, categories: cats, alertDetail: detail }),
    onSuccess: () => {
      toast('Invitation created. They need to sign in with that number and accept.');
      setPhone('');
      void qc.invalidateQueries({ queryKey: ['care', 'links'] });
    },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Caretakers" subtitle="Invite someone you trust to follow chosen parts of your information. You decide each category and can stop sharing at any time." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <QueryView query={links}>
          {(d) =>
            d.items.length === 0 ? (
              <EmptyState icon={Users} title="No caretakers yet">
                A caretaker can be a family member or friend who helps you remember your medicines.
              </EmptyState>
            ) : (
              <ul className="grid gap-3">
                {d.items.map((l) => (
                  <LinkCard key={l.id} l={l} />
                ))}
              </ul>
            )
          }
        </QueryView>
        <Card className="h-fit p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <UserPlus className="size-5 text-primary-600" aria-hidden /> Invite a caretaker
          </h2>
          <form
            className="mt-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <Field label="Their phone number">{(id) => <Input id={id} type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6XX XX XX XX" />}</Field>
            <div>
              <p className="text-sm font-semibold">What they can see</p>
              <CategoryPicker value={cats} onChange={setCats} />
              <Toggle checked={detail} onChange={setDetail} label="Include medicine names in alerts" />
            </div>
            <Notice icon={ShieldCheck}>By inviting, you consent to share the selected categories with this person. This is recorded and you can withdraw it at any time.</Notice>
            {invite.isError ? <Notice tone="danger">{errorMessage(invite.error)}</Notice> : null}
            <Button type="submit" loading={invite.isPending} disabled={!cats.length}>
              Send invitation
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Crown, FlaskConical, Loader2, Smartphone, XCircle } from 'lucide-react';
import { Badge, Button, Card, Dialog, Field, Input, LinkButton, Notice, PageHeader, QueryView, StatusBadge, errorMessage } from '../../components/ui';
import { api, post } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import type { Payment, Subscription } from '../../lib/types';

const FEATURE_LABEL: Record<string, string> = {
  reminders: 'Medicine & checkup reminders',
  vitals: 'Readings log',
  steps: 'Steps',
  water: 'Water',
  streaks: 'Streaks & adherence',
  history_export: 'PDF summary for your clinician',
};

export function BillingPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['subscription'], queryFn: () => api<Subscription>('/me/subscription') });
  const [demo, setDemo] = useState<Payment | null>(null);
  const [email, setEmail] = useState('');
  const checkout = useMutation({
    mutationFn: () => post<Payment>('/me/checkout', email ? { email } : {}),
    onSuccess: (p) => {
      if (p.checkoutUrl) window.location.assign(p.checkoutUrl);
      else setDemo(p);
    },
  });
  const confirmDemo = useMutation({
    mutationFn: (id: string) => post<Payment>(`/me/payments/${id}/demo-confirm`),
    onSuccess: () => {
      setDemo(null);
      void qc.invalidateQueries();
    },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Plan & payments" />
      <QueryView query={q}>
        {(s) => (
          <div className="grid gap-5">
            <Card className="overflow-hidden border-primary-700 bg-primary-700 p-6 text-white">
              <p className="text-sm text-white/80">Your plan</p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
                {s.tier === 'premium' ? <Crown className="size-6" aria-hidden /> : null}
                {s.tier === 'trial' ? 'Free trial' : s.tier === 'premium' ? 'Premium' : 'Free'}
              </p>
              <p className="mt-1 text-sm text-white/90">
                {s.tier === 'trial'
                  ? `${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left · ends ${dateTime(s.trialEndsAt)}`
                  : s.tier === 'premium'
                    ? `Active until ${dateTime(s.premiumUntil!)}`
                    : `Trial ended ${dateTime(s.trialEndsAt)}`}
              </p>
            </Card>
            <Card className="p-5">
              <h2 className="font-bold">Always free</h2>
              <p className="mt-1 text-sm text-muted">Find verified pharmacies · compare reported prices · reviewed medicine information · contact pharmacies.</p>
              <h2 className="mt-4 font-bold">Premium</h2>
              <ul className="mt-2 grid gap-1.5 text-sm">
                {s.premiumFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-secondary-600" aria-hidden /> {FEATURE_LABEL[f] ?? f}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-4">
                <div>
                  <p className="text-2xl font-extrabold">{money(s.price.amount, s.price.currency)}</p>
                  <p className="text-xs text-muted">for {s.price.periodDays} days · price shown is a placeholder set by the operator</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {s.provider === 'fapshi' ? (
                    <Field label="Email for receipt" optional>
                      {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-60" />}
                    </Field>
                  ) : null}
                  <Button size="lg" icon={s.provider === 'demo' ? FlaskConical : Smartphone} loading={checkout.isPending} onClick={() => checkout.mutate()}>
                    {s.tier === 'premium' ? 'Extend Premium' : 'Get Premium'}
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                {s.provider === 'demo' ? (
                  <Notice tone="warning" title="Test / demo checkout">
                    No payment provider is connected. The checkout is simulated and no money is charged.
                  </Notice>
                ) : (
                  <Notice>
                    Payment by MTN Mobile Money or Orange Money through Fapshi{s.providerEnvironment === 'sandbox' ? ' (sandbox: test payments only, no real money)' : ''}. You will be sent to Fapshi’s secure page and brought back here.
                  </Notice>
                )}
              </div>
              {checkout.isError ? (
                <div className="mt-3">
                  <Notice tone="danger">{errorMessage(checkout.error)}</Notice>
                </div>
              ) : null}
            </Card>
            {s.payments.length ? (
              <Card className="p-5">
                <h2 className="font-bold">Payments</h2>
                <ul className="mt-2 divide-y divide-border text-sm">
                  {s.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {money(p.amount, p.currency)} · {p.periodDays} days · {dateTime(p.createdAt)} · {p.provider === 'demo' ? <Badge tone="amber">demo</Badge> : 'Fapshi'}
                      </span>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        )}
      </QueryView>

      <Dialog
        open={!!demo}
        onClose={() => setDemo(null)}
        title="Test / demo checkout"
        footer={
          <>
            <Button variant="outline" onClick={() => setDemo(null)}>
              Cancel
            </Button>
            <Button variant="green" loading={confirmDemo.isPending} onClick={() => demo && confirmDemo.mutate(demo.id)}>
              Simulate successful payment
            </Button>
          </>
        }
      >
        <div className="rounded-xl border-2 border-dashed border-warning bg-warning-bg p-4">
          <p className="font-bold text-warning">This is not a real payment.</p>
          <p className="mt-1 text-[#6b3a00]">No mobile money account is charged. This demo checkout only shows how Premium is unlocked after a provider confirms payment.</p>
        </div>
        {demo ? <p className="mt-3">Amount shown: {money(demo.amount, demo.currency)} for {demo.periodDays} days.</p> : null}
      </Dialog>
    </div>
  );
}

/** Return page after Fapshi checkout. Never trusts the redirect: it asks the server, which re-checks Fapshi. */
export function BillingReturnPage() {
  const [params] = useSearchParams();
  const id = params.get('payment') ?? '';
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api<Payment>(`/me/payments/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data && ['successful', 'failed', 'expired'].includes(query.state.data.status) ? false : 5000),
  });
  useEffect(() => {
    if (q.data?.status === 'successful') void qc.invalidateQueries({ queryKey: ['subscription'] });
  }, [q.data?.status, qc]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Payment status" back="/app/billing" />
      <QueryView query={q}>
        {(p) => (
          <Card className="p-6 text-center">
            {p.status === 'successful' ? (
              <>
                <CheckCircle2 className="mx-auto size-12 text-secondary-600" aria-hidden />
                <p className="mt-3 text-xl font-bold">Payment confirmed</p>
                <p className="text-sm text-muted">Premium is active. Thank you!</p>
              </>
            ) : p.status === 'failed' || p.status === 'expired' ? (
              <>
                <XCircle className="mx-auto size-12 text-danger" aria-hidden />
                <p className="mt-3 text-xl font-bold">Payment {p.status}</p>
                <p className="text-sm text-muted">No Premium time was added. You can try again.</p>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto size-12 animate-spin text-primary-600" aria-hidden />
                <p className="mt-3 text-xl font-bold">Waiting for confirmation…</p>
                <p className="text-sm text-muted">Approve the request on your phone. This page checks with the payment provider automatically.</p>
              </>
            )}
            <LinkButton to="/app/billing" variant="outline" className="mt-5">
              Back to plan
            </LinkButton>
          </Card>
        )}
      </QueryView>
    </div>
  );
}

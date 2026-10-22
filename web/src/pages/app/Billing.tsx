import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Crown, FlaskConical, Loader2, Smartphone, XCircle } from 'lucide-react';
import { Button, Card, Dialog, Field, Input, LinkButton, List, ListItem, ListRow, Notice, PageHeader, QueryView, StatusBadge, errorMessage } from '../../components/ui';
import { api, post } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import type { Payment, Subscription } from '../../lib/types';

const FEATURE_LABEL: Record<string, string> = {
  reminders: 'Medicine and checkup reminders',
  vitals: 'Readings log',
  steps: 'Steps',
  water: 'Water',
  streaks: 'Streaks and adherence',
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
      <PageHeader title="Plan and payments" />
      <QueryView query={q}>
        {(s) => (
          <div className="grid gap-5">
            <List label="Your plan">
              <ListRow
                icon={s.tier === 'premium' ? Crown : CalendarClock}
                tone={s.tier === 'free' ? 'muted' : 'blue'}
                title={s.tier === 'trial' ? 'Free trial' : s.tier === 'premium' ? 'Premium' : 'Free plan'}
                detail={
                  s.tier === 'trial'
                    ? `${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left, ends ${dateTime(s.trialEndsAt)}`
                    : s.tier === 'premium'
                      ? `Active until ${dateTime(s.premiumUntil!)}`
                      : `Trial ended ${dateTime(s.trialEndsAt)}`
                }
              />
            </List>
            <section aria-labelledby="free-h">
              <h2 id="free-h" className="mb-2 text-lg font-bold">
                Always free
              </h2>
              <p className="text-sm text-muted">Find verified pharmacies, compare reported prices, read reviewed medicine information and message pharmacies.</p>
            </section>
            <section aria-labelledby="premium-h">
              <h2 id="premium-h" className="mb-2 text-lg font-bold">
                Premium
              </h2>
              <List label="Premium features">
                {s.premiumFeatures.map((f) => (
                  <ListRow key={f} icon={CheckCircle2} tone="green" title={FEATURE_LABEL[f] ?? f} />
                ))}
              </List>
              <Card className="mt-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-2xl font-bold">{money(s.price.amount, s.price.currency)}</p>
                  <p className="text-sm text-muted">for {s.price.periodDays} days</p>
                </div>
                <p className="mt-1 text-xs text-muted">The price is a placeholder set by the operator.</p>
                {s.provider === 'fapshi' ? (
                  <div className="mt-4">
                    <Field label="Email for receipt" optional>
                      {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
                    </Field>
                  </div>
                ) : null}
                <Button size="lg" className="mt-4 w-full" icon={s.provider === 'demo' ? FlaskConical : Smartphone} loading={checkout.isPending} onClick={() => checkout.mutate()}>
                  {s.tier === 'premium' ? 'Extend Premium' : 'Get Premium'}
                </Button>
                <div className="mt-3">
                  {s.provider === 'demo' ? (
                    <Notice tone="warning" title="Test checkout">
                      No payment provider is connected. The checkout is simulated and no money is charged.
                    </Notice>
                  ) : (
                    <Notice>
                      Pay with MTN Mobile Money or Orange Money through Fapshi{s.providerEnvironment === 'sandbox' ? ' (sandbox: test payments only, no real money)' : ''}. You go to Fapshi’s payment page and come back here.
                    </Notice>
                  )}
                </div>
                {checkout.isError ? (
                  <div className="mt-3">
                    <Notice tone="danger">{errorMessage(checkout.error)}</Notice>
                  </div>
                ) : null}
              </Card>
            </section>
            {s.payments.length ? (
              <section aria-labelledby="payments-h">
                <h2 id="payments-h" className="mb-2 text-lg font-bold">
                  Payments
                </h2>
                <List label="Payments">
                  {s.payments.map((p) => (
                    <ListItem key={p.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-sm">
                        <span className="block font-semibold">
                          {money(p.amount, p.currency)} for {p.periodDays} days
                        </span>
                        <span className="block text-xs text-muted">
                          {dateTime(p.createdAt)} · {p.provider === 'demo' ? 'test checkout, no money moved' : 'Fapshi'}
                        </span>
                      </span>
                      <StatusBadge status={p.status} />
                    </ListItem>
                  ))}
                </List>
              </section>
            ) : null}
          </div>
        )}
      </QueryView>

      <Dialog
        open={!!demo}
        onClose={() => setDemo(null)}
        title="Test checkout"
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

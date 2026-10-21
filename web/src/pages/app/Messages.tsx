import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Phone, Search, Send } from 'lucide-react';
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, QueryView, StatusBadge, Textarea, cx, errorMessage, useToast } from '../../components/ui';
import { api, post } from '../../lib/api';
import { dateTime } from '../../lib/format';
import type { Thread } from '../../lib/types';

interface InquiryRow {
  id: string;
  subject: string;
  status: string;
  channel: string;
  updatedAt: string;
  pharmacy: { id: string; name: string; phone: string };
}

export function MessagesPage() {
  const q = useQuery({ queryKey: ['inquiries'], queryFn: () => api<{ items: InquiryRow[] }>('/inquiries') });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Messages"
        subtitle="Your questions to pharmacies. Start a conversation from a pharmacy’s page."
        actions={
          <LinkButton to="/find" variant="outline" icon={Search}>
            Find a pharmacy
          </LinkButton>
        }
      />
      <QueryView query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No conversations yet" action={<LinkButton to="/find">Find a pharmacy</LinkButton>} />
          ) : (
            <ul className="grid gap-2">
              {d.items.map((i) => (
                <li key={i.id}>
                  <Link to={`/app/messages/${i.id}`}>
                    <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary-400">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{i.pharmacy.name}</p>
                        <p className="truncate text-sm text-muted">{i.subject}</p>
                        <p className="text-xs text-muted">
                          {dateTime(i.updatedAt)} · via {i.channel}
                        </p>
                      </div>
                      <StatusBadge status={i.status} />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </div>
  );
}

/** Conversation thread — shared by the patient and the pharmacy portal (server decides who may read it). */
export function ThreadPage() {
  const { id = '' } = useParams();
  const { pathname } = useLocation();
  const inPortal = pathname.startsWith('/pharmacy');
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['thread', id], queryFn: () => api<Thread>(`/inquiries/${id}`), refetchInterval: 15000 });
  const send = useMutation({
    mutationFn: () => post<Thread>(`/inquiries/${id}/messages`, { body }),
    onSuccess: (t) => {
      qc.setQueryData(['thread', id], t);
      setBody('');
      void qc.invalidateQueries({ queryKey: ['inquiries'] });
      void qc.invalidateQueries({ queryKey: ['pharmacy', 'inbox'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const close = useMutation({
    mutationFn: () => post<Thread>(`/inquiries/${id}/close`),
    onSuccess: (t) => qc.setQueryData(['thread', id], t),
  });
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [q.data?.messages.length]);
  return (
    <div className="mx-auto max-w-3xl">
      <QueryView query={q}>
        {(t) => (
          <>
            <PageHeader
              back={inPortal ? '/pharmacy/inbox' : '/app/messages'}
              title={t.subject}
              subtitle={inPortal ? `From ${t.patient.displayName} (${t.patient.phone})` : t.pharmacy.name}
              actions={
                <>
                  {!inPortal ? (
                    <a href={`tel:${t.pharmacy.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-primary-700">
                      <Phone className="size-4" aria-hidden /> Call
                    </a>
                  ) : null}
                  {t.status !== 'closed' ? (
                    <Button variant="ghost" onClick={() => close.mutate()} loading={close.isPending}>
                      Close conversation
                    </Button>
                  ) : null}
                </>
              }
            />
            <div className="mb-3 flex flex-wrap gap-2">
              <StatusBadge status={t.status} />
              <Badge>Started via {t.channel}</Badge>
              {inPortal && t.channel !== 'web' ? <Badge tone="amber">Your reply is sent to the patient by SMS{''}</Badge> : null}
            </div>
            <Card className="p-4">
              <ol className="grid max-h-[55vh] gap-3 overflow-y-auto" aria-live="polite">
                {t.messages.map((m) => {
                  const mine = (m.senderRole === 'pharmacy') === (t.viewerRole === 'pharmacy');
                  return (
                    <li key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cx('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm', mine ? 'rounded-br-md bg-primary-600 text-white' : 'rounded-bl-md bg-slate-100 text-ink')}>
                        <p className="whitespace-pre-line">{m.body}</p>
                        <p className={cx('mt-1 text-[10px]', mine ? 'text-white/75' : 'text-muted')}>
                          {m.senderRole === 'pharmacy' ? t.pharmacy.name : t.patient.displayName} · {dateTime(m.createdAt)} · {m.channel}
                        </p>
                      </div>
                    </li>
                  );
                })}
                <div ref={endRef} />
              </ol>
              {t.status !== 'closed' ? (
                <form
                  className="mt-4 flex items-end gap-2 border-t border-border pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (body.trim()) send.mutate();
                  }}
                >
                  <label htmlFor="reply" className="sr-only">Reply</label>
                  <Textarea id="reply" rows={2} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
                  <Button type="submit" icon={Send} loading={send.isPending} aria-label="Send" />
                </form>
              ) : (
                <p className="mt-4 border-t border-border pt-4 text-sm text-muted">This conversation is closed.</p>
              )}
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}

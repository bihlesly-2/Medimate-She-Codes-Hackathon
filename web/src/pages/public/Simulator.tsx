import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Hash, PhoneCall, Play, RotateCcw, Send, Smartphone, TimerOff } from 'lucide-react';
import { Badge, Button, Card, Chip, EmptyState, Field, Input, Notice, Select, Tabs, errorMessage, useToast } from '../../components/ui';
import { api, post } from '../../lib/api';
import { useConfig } from '../../lib/auth';

interface ThreadMsg {
  id: string;
  direction: 'in' | 'out';
  body: string | null;
  status: string;
  command: string | null;
  segments: number;
  encoding: string;
  createdAt: string;
}
interface ThreadResp {
  phone: string;
  provider: string;
  live: boolean;
  session: { language: string; pending: string[] } | null;
  messages: ThreadMsg[];
}

const PHONES = [
  ['600000099', 'New person (not registered)'],
  ['600000001', 'Ama, demo patient'],
  ['600000002', 'Ben, trial ended'],
  ['600000003', 'Clara, demo caretaker'],
];

const SMS_SCRIPTS: Record<string, string[]> = {
  'Register + find + log': ['JOIN', 'YES', 'FIND paracetamol, Molyko', '2', 'PRICE amoxicillin', 'INFO paracetamol 500', 'WATER 2 GLASSES', 'STEPS 4500', 'BP 120/80', 'HELP'],
  'Reminder answer': ['TAKEN'],
  'Opt out and back in': ['STOP', 'START', 'YES'],
};
const USSD_SCRIPTS: Record<string, string[]> = {
  'Find medicine': ['', '1', 'paracetamol', '2', '1', '1'],
  'Log water': ['', '3', '3', '2'],
  'Back & Home': ['', '1', 'ors', '0', '0', '6', '00'],
};

function KeypadPhone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[34px] border-[5px] border-slate-700 bg-slate-800 p-4">
      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <div className="min-h-[260px] rounded-xl bg-[#c9e3c4] p-3 font-mono text-[13px] leading-snug text-slate-900">{children}</div>
    </div>
  );
}

function SmsSim({ phone }: { phone: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const thread = useQuery({ queryKey: ['sim-thread', phone], queryFn: () => api<ThreadResp>(`/sim/sms/thread?phone=${encodeURIComponent(phone)}`), refetchInterval: 8000 });
  const send = useMutation({
    mutationFn: (t: string) => post<{ replies: string[] }>('/sim/sms', { phone, text: t }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sim-thread', phone] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const reset = useMutation({
    mutationFn: () => post('/sim/reset', { phone }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sim-thread', phone] }),
  });
  const tick = useMutation({
    mutationFn: () => post<Record<string, number>>('/sim/tick'),
    onSuccess: (r) => {
      toast(`Reminder engine ran: ${r.sent} sent, ${r.followups} follow-ups, ${r.escalations} caretaker alerts.`, 'info');
      void qc.invalidateQueries({ queryKey: ['sim-thread', phone] });
    },
  });
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [thread.data?.messages.length]);

  const runScript = async (cmds: string[]) => {
    for (const c of cmds) await send.mutateAsync(c).catch(() => undefined);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <div>
        <KeypadPhone label="Basic phone · SMS">
          <div ref={boxRef} className="max-h-[340px] space-y-2 overflow-y-auto pr-1" aria-live="polite">
            {(thread.data?.messages ?? []).length === 0 ? <p className="text-slate-600">No messages yet. Send HELP or JOIN.</p> : null}
            {thread.data?.messages.map((m) => (
              <div key={m.id} className={m.direction === 'in' ? 'text-right' : ''}>
                <p className={`inline-block max-w-[92%] rounded-md px-2 py-1 text-left ${m.direction === 'in' ? 'bg-slate-900/80 text-[#c9e3c4]' : 'bg-white/70'}`}>
                  {m.body ?? <em className="text-slate-500">[message text deleted after retention period]</em>}
                </p>
                <p className="mt-0.5 text-[9px] text-slate-600">
                  {m.direction === 'in' ? 'You' : `MEDIMATE · ${m.status.toUpperCase()}`} · {m.segments} seg · {m.encoding}
                </p>
              </div>
            ))}
          </div>
        </KeypadPhone>
        <form
          className="mx-auto mt-3 flex max-w-[300px] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send.mutate(text);
            setText('');
          }}
        >
          <label htmlFor="sms-in" className="sr-only">SMS text</label>
          <Input id="sms-in" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a command…" maxLength={480} />
          <Button type="submit" icon={Send} loading={send.isPending} aria-label="Send SMS" />
        </form>
      </div>
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-sm font-bold">Quick commands</p>
          <div className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {['HELP', 'JOIN', 'YES', 'FIND paracetamol, Molyko', 'PRICE paracetamol 500', 'INFO paracetamol 500', 'MORE', 'TAKEN', 'SKIP', 'WATER 500ML', 'STEPS 3000', 'BP 120/80', 'SUGAR 5.6 MMOL', 'CONTACT MOL1 Do you have ORS?', 'LANG FR', 'LANG EN', 'STOP', 'START'].map((c) => (
              <Chip key={c} onClick={() => send.mutate(c)}>
                <span className="font-mono text-xs">{c}</span>
              </Chip>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-bold">Test scripts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(SMS_SCRIPTS).map(([name, cmds]) => (
              <Button key={name} variant="outline" size="sm" icon={Play} onClick={() => void runScript(cmds)} disabled={send.isPending}>
                {name}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => reset.mutate()} loading={reset.isPending}>
              Reset this phone’s simulator state
            </Button>
            <Button variant="ghost" size="sm" icon={AlarmClock} onClick={() => tick.mutate()} loading={tick.isPending}>
              Run reminder engine now
            </Button>
          </div>
        </Card>
        <Card className="p-4 text-sm">
          <p className="font-bold">Session state</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">Number</dt>
            <dd className="font-mono">{thread.data?.phone ?? 'not set'}</dd>
            <dt className="text-muted">Gateway</dt>
            <dd>
              {thread.data?.live ? <Badge tone="red">LIVE provider</Badge> : <Badge tone="amber">Simulator: nothing is delivered</Badge>}
            </dd>
            <dt className="text-muted">Language</dt>
            <dd>{thread.data?.session?.language ?? 'en'}</dd>
            <dt className="text-muted">Waiting for</dt>
            <dd>{thread.data?.session?.pending.filter((p) => p !== 'pages').join(', ') || 'nothing'}</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function UssdSim({ phone }: { phone: string }) {
  const { data: config } = useConfig();
  const toast = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screen, setScreen] = useState<{ text: string; end: boolean; screen?: string } | null>(null);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const step = useMutation({
    mutationFn: (v: { sid: string; input: string; expire?: boolean }) => post<{ text: string; end: boolean; screen?: string }>('/sim/ussd', { sessionId: v.sid, phone, input: v.input, expire: v.expire }),
    onSuccess: (r, v) => {
      setScreen(r);
      setHistory((h) => [...h, v.input === '' ? `dial ${config?.ussdCode ?? '*123#'}` : v.input]);
      if (r.end) setSessionId(null);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const dial = () => {
    const sid = `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setSessionId(sid);
    setHistory([]);
    step.mutate({ sid, input: '' });
  };
  const sendInput = (v: string, expire = false) => {
    if (!sessionId) return;
    step.mutate({ sid: sessionId, input: v, expire });
    setInput('');
  };
  const runScript = async (inputs: string[]) => {
    const sid = `sim-${Date.now().toString(36)}`;
    setSessionId(sid);
    setHistory([]);
    for (const i of inputs) {
      const r = await step.mutateAsync({ sid, input: i }).catch(() => null);
      if (!r || r.end) break;
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <div>
        <KeypadPhone label={`USSD · ${config?.ussdCode ?? '*123#'} (placeholder)`}>
          {screen ? (
            <div aria-live="polite">
              <pre className="whitespace-pre-wrap font-mono text-[13px]">{screen.text}</pre>
              {screen.end ? <p className="mt-3 text-[11px] font-bold text-slate-700">Session ended.</p> : null}
            </div>
          ) : (
            <p className="text-slate-600">Press “Dial” to start a USSD session.</p>
          )}
        </KeypadPhone>
        <div className="mx-auto mt-3 max-w-[300px] space-y-2">
          {sessionId ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendInput(input);
              }}
            >
              <label htmlFor="ussd-in" className="sr-only">Reply</label>
              <Input id="ussd-in" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Reply…" maxLength={160} />
              <Button type="submit" icon={Send} loading={step.isPending} aria-label="Send reply" />
            </form>
          ) : (
            <Button className="w-full" variant="green" icon={PhoneCall} onClick={dial} loading={step.isPending}>
              Dial {config?.ussdCode ?? '*123#'}
            </Button>
          )}
          {sessionId ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => sendInput('0')}>
                0 Back
              </Button>
              <Button variant="outline" size="sm" onClick={() => sendInput('00')}>
                00 Home
              </Button>
              <Button variant="ghost" size="sm" icon={TimerOff} onClick={() => sendInput(input || '1', true)}>
                Simulate timeout
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-sm font-bold">Test scripts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(USSD_SCRIPTS).map(([name, inputs]) => (
              <Button key={name} variant="outline" size="sm" icon={Play} onClick={() => void runScript(inputs)}>
                {name}
              </Button>
            ))}
          </div>
        </Card>
        <Card className="p-4 text-sm">
          <p className="font-bold">Session state</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">Session</dt>
            <dd className="font-mono text-xs">{sessionId ?? 'none'}</dd>
            <dt className="text-muted">Screen</dt>
            <dd className="font-mono text-xs">{screen?.screen ?? 'none'}</dd>
            <dt className="text-muted">Inputs</dt>
            <dd className="font-mono text-xs">{history.join(' → ') || 'none'}</dd>
            <dt className="text-muted">Timeout</dt>
            <dd>120 seconds of inactivity; a new session never shows the previous screen.</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}

export default function Simulator() {
  const { data: config, isPending } = useConfig();
  const [tab, setTab] = useState<'sms' | 'ussd'>('sms');
  const [phone, setPhone] = useState('600000099');
  const [custom, setCustom] = useState('');
  if (!isPending && !config?.demoMode) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState icon={Smartphone} title="Simulator is turned off">
          The browser simulator is only available in demo mode.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">SMS and USSD simulator</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Try MEDIMATE the way someone with a basic phone would. The same accounts and data are used as on the web.</p>
        </div>
        <Badge tone="amber" icon={Hash}>
          Simulated, not carrier delivery
        </Badge>
      </div>
      <div className="mt-4">
        <Notice tone="warning" title="Nothing here reaches a real phone">
          Messages are processed by the real MEDIMATE command engine but delivered only to this page. {config?.publicDemo ? 'The public demo accepts fictional numbers +237 600 xxx xxx only.' : ''}
        </Notice>
      </div>
      <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <Tabs
          label="Channel"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'sms', label: 'SMS' },
            { value: 'ussd', label: 'USSD' },
          ]}
        />
        <div className="w-full sm:max-w-xs">
          <Field label="Phone number">
            {(id) => (
              <Select id={id} value={PHONES.some(([n]) => n === phone) ? phone : 'custom'} onChange={(e) => e.target.value !== 'custom' && setPhone(e.target.value)}>
                {PHONES.map(([n, l]) => (
                  <option key={n} value={n}>
                    +237 {n} · {l}
                  </option>
                ))}
                <option value="custom">Another number…</option>
              </Select>
            )}
          </Field>
        </div>
        <form
          className="flex items-end gap-2 [&>div]:flex-1 sm:[&>div]:flex-none"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) setPhone(custom.trim());
          }}
        >
          <Field label="Or type a number">{(id) => <Input id={id} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="600 000 123" className="w-full sm:w-40" />}</Field>
          <Button type="submit" variant="outline">
            Use
          </Button>
        </form>
      </div>
      <div className="mt-6">{tab === 'sms' ? <SmsSim key={phone} phone={phone} /> : <UssdSim key={phone} phone={phone} />}</div>
    </div>
  );
}

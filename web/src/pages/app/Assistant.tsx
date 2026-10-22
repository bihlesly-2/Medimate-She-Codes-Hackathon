import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Mic, Send, Sparkles } from 'lucide-react';
import { LogoMark } from '../../components/brand';
import { Button, EmptyState, Notice, cx } from '../../components/ui';
import { post } from '../../lib/api';
import { useConfig, useMe } from '../../lib/auth';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  actions?: { tool: string; summary: string }[];
}

const SUGGESTIONS = ['I drank 2 glasses of water', 'I took my medicine', 'What do I have today?', 'Where can I find paracetamol?', 'Tell my family I am not feeling well'];
const KEY = 'medimate-assistant';

type SpeechCtor = new () => { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void };
function speechRecognition(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function Assistant() {
  const { data: config } = useConfig();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Msg[];
    } catch {
      return [];
    }
  });
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const Speech = typeof window !== 'undefined' ? speechRecognition() : null;

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-20)));
    } catch {
      /* private mode: history just isn't kept */
    }
    endRef.current?.parentElement?.scrollTo({ top: endRef.current.parentElement.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  const ask = useMutation({
    mutationFn: (history: Msg[]) => post<{ reply: string; actions: { tool: string; summary: string }[] }>('/assistant', { messages: history.slice(-12).map(({ role, content }) => ({ role, content })) }),
    onSuccess: (r) => {
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply, actions: r.actions }]);
      if (r.actions.length) {
        for (const k of ['water', 'steps', 'vitals', 'reminders', 'progress']) void qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });

  const send = (content: string) => {
    const c = content.trim();
    if (!c || ask.isPending) return;
    const next: Msg[] = [...msgs, { role: 'user', content: c }];
    // The API needs the conversation to start with the person's message.
    const firstUser = next.findIndex((m) => m.role === 'user');
    setMsgs(next);
    setText('');
    ask.mutate(next.slice(firstUser));
  };

  const listen = () => {
    if (!Speech) return;
    const rec = new Speech();
    rec.lang = me?.language === 'fr' ? 'fr-FR' : 'en-GB';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? '';
      if (said) send(said);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  if (config && !config.assistant) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState icon={Sparkles} title="Ask MEDIMATE is under maintenance">
          We are getting it ready. Please check back soon. Everything else in MEDIMATE works as usual.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-11rem)] max-w-xl flex-col md:h-[calc(100dvh-6rem)]">
      <header className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-white shadow-[0_4px_0_var(--color-border)]">
          <LogoMark size={36} />
        </span>
        <div>
          <h1 className="text-2xl leading-tight">Ask MEDIMATE</h1>
          <p className="text-sm text-muted">Log, check and find things by just saying them.</p>
        </div>
      </header>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pb-2" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="slide-up">
            <div className="card-3d rounded-2xl bg-white p-4 text-[15px]">
              Hi {me?.displayName?.split(' ')[0] ?? 'there'}! I can log your water, steps and readings, answer your medicine reminder, find a medicine, or message your family. What would you like to do?
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="min-h-10 rounded-xl border-2 border-b-4 border-border bg-white px-3 text-left text-sm font-bold text-primary-700 active:translate-y-[2px] active:border-b-2">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {msgs.map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] whitespace-pre-line rounded-3xl px-4 py-2.5 text-[15px]', m.role === 'user' ? 'rounded-br-md bg-primary-600 text-white' : 'card-3d rounded-bl-md bg-white text-ink')}>
              {m.content}
              {m.actions?.length ? (
                <span className="mt-2 flex flex-wrap gap-1">
                  {m.actions.map((a, j) => (
                    <span key={j} className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2 py-0.5 text-xs font-bold text-secondary-700">
                      <Check className="size-3.5" aria-hidden /> {a.summary}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {ask.isPending ? (
          <div className="flex justify-start">
            <div className="card-3d flex gap-1 rounded-3xl rounded-bl-md bg-white px-4 py-3" aria-label="MEDIMATE is typing">
              {[0, 1, 2].map((i) => (
                <span key={i} className="bob size-2 rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        ) : null}
        {ask.isError ? <Notice tone="warning">Ask MEDIMATE is taking a short break. Please try again in a few minutes.</Notice> : null}
        <div ref={endRef} />
      </div>

      <form
        className="mt-2 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="ask-in" className="sr-only">
          Message
        </label>
        <textarea
          id="ask-in"
          rows={1}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Type or tap the mic…"
          className="block min-h-12 flex-1 resize-none rounded-2xl border-2 border-border bg-white px-4 py-3 text-[15px] focus:border-primary-500 focus:outline-none"
        />
        {Speech ? (
          <Button type="button" variant="outline" aria-label="Speak" onClick={listen} className={cx('!px-3', listening && 'pulse-ring')}>
            <Mic className="size-5" aria-hidden />
          </Button>
        ) : null}
        <Button type="submit" aria-label="Send" disabled={!text.trim()} loading={ask.isPending} className="!px-3">
          <Send className="size-5" aria-hidden />
        </Button>
      </form>
      <p className="mt-1 text-center text-[11px] text-muted">MEDIMATE’s assistant can make mistakes and never gives medical advice.</p>
    </div>
  );
}

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleHelp,
  Clock,
  Crown,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { STATUS_LABEL } from '../lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'green' | 'outline' | 'ghost' | 'danger' | 'white';
/** Chunky "3D" buttons: a darker edge under the face that presses down on tap (see .btn-3d). */
const VARIANT: Record<Variant, string> = {
  primary: 'btn-3d bg-primary-600 text-white hover:bg-primary-500 [--edge:var(--color-primary-900)]',
  green: 'btn-3d bg-secondary-600 text-white hover:bg-secondary-teal [--edge:#0e4f22]',
  outline: 'btn-3d border-2 border-border bg-white text-primary-700 hover:bg-sky [--edge:var(--color-border)]',
  ghost: 'text-primary-700 hover:bg-primary-50',
  danger: 'btn-3d bg-danger text-white hover:brightness-95 [--edge:#8e1b1b]',
  white: 'btn-3d bg-white text-primary-700 hover:bg-primary-50 [--edge:#c9d8ea]',
};
const SIZE = { sm: 'min-h-10 px-3.5 text-sm rounded-xl', md: 'min-h-12 px-5 text-[15px] rounded-2xl', lg: 'min-h-14 px-6 text-base rounded-2xl' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZE;
  loading?: boolean;
  icon?: LucideIcon;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 font-brand font-extrabold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function LinkButton({ variant = 'primary', size = 'md', icon: Icon, className, children, ...rest }: LinkProps & { variant?: Variant; size?: keyof typeof SIZE; icon?: LucideIcon }) {
  return (
    <Link className={cx('inline-flex select-none items-center justify-center gap-2 font-brand font-extrabold tracking-wide transition-colors', VARIANT[variant], SIZE[size], className)} {...rest}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- surfaces

export function Card({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' | 'li' } & Record<string, unknown>) {
  return (
    <As className={cx('card-3d rounded-[var(--radius-card)] bg-white', className)} {...rest}>
      {children}
    </As>
  );
}

/** Grouped list (settings-style rows) — the default way to show a set of items on a phone. */
export function List({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cx('card-3d divide-y-2 divide-slate-100 overflow-hidden rounded-[var(--radius-card)] bg-white', className)}>
      {children}
    </ul>
  );
}

export function ListRow({
  to,
  icon: Icon,
  title,
  detail,
  right,
  tone = 'blue',
}: {
  to?: string;
  icon?: LucideIcon;
  title: ReactNode;
  detail?: ReactNode;
  right?: ReactNode;
  tone?: 'blue' | 'green' | 'muted';
}) {
  const body = (
    <>
      {Icon ? (
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', tone === 'green' ? 'bg-secondary-50 text-secondary-600' : tone === 'muted' ? 'bg-slate-100 text-muted' : 'bg-primary-50 text-primary-600')}>
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{title}</span>
        {detail ? <span className="block text-sm text-muted">{detail}</span> : null}
      </span>
      {right}
      {to ? <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden /> : null}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-sky active:bg-primary-50">
          {body}
        </Link>
      ) : (
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  );
}

/** A row inside a <List> with free-form content: stacked text on a phone, actions below or to the right. */
export function ListItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cx('px-4 py-3', className)}>{children}</li>;
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back ? (
          <Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Link>
        ) : null}
        <h1 className="text-[26px] leading-tight text-ink sm:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-lg text-ink">{children}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- badges

type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red';
const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  blue: 'bg-primary-50 text-primary-700',
  green: 'bg-secondary-50 text-secondary-700',
  amber: 'bg-warning-bg text-warning',
  red: 'bg-danger-bg text-danger',
};
export function Badge({ tone = 'neutral', icon: Icon, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE[tone], className)}>
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, [Tone, LucideIcon]> = {
  taken: ['green', CheckCircle2],
  answered: ['green', CheckCircle2],
  approved: ['green', ShieldCheck],
  verified: ['green', ShieldCheck],
  published: ['green', CheckCircle2],
  active: ['green', CheckCircle2],
  resolved: ['green', CheckCircle2],
  successful: ['green', CheckCircle2],
  skipped: ['neutral', CircleDashed],
  closed: ['neutral', CircleDashed],
  archived: ['neutral', CircleDashed],
  none: ['neutral', CircleHelp],
  draft: ['neutral', CircleDashed],
  declined: ['neutral', XCircle],
  dismissed: ['neutral', CircleDashed],
  revoked: ['neutral', XCircle],
  created: ['neutral', CircleDashed],
  scheduled: ['blue', Clock],
  sent: ['amber', Clock],
  open: ['blue', Clock],
  pending: ['amber', Clock],
  in_review: ['amber', Clock],
  investigating: ['amber', Clock],
  missed: ['red', AlertTriangle],
  rejected: ['red', XCircle],
  expired: ['red', AlertTriangle],
  suspended: ['red', AlertTriangle],
  failed: ['red', XCircle],
};
/** Status is always shown with an icon and a word — never colour alone. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const [tone, icon] = STATUS_TONE[status] ?? ['neutral', CircleHelp];
  return (
    <Badge tone={tone} icon={icon}>
      {label ?? STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function StockBadge({ state, stale }: { state: string; stale?: boolean }) {
  const map: Record<string, [Tone, LucideIcon, string]> = {
    in_stock: ['green', CheckCircle2, 'Last reported in stock'],
    low: ['amber', AlertTriangle, 'Last reported low'],
    out: ['red', XCircle, 'Last reported out'],
    unknown: ['neutral', CircleHelp, 'Stock unknown'],
  };
  const [tone, icon, label] = map[state] ?? map.unknown!;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={stale ? 'neutral' : tone} icon={icon}>
        {label}
      </Badge>
      {stale ? (
        <Badge tone="amber" icon={Clock}>
          Over 48 h old, may have changed
        </Badge>
      ) : null}
    </span>
  );
}

export function DemoTag() {
  return (
    <Badge tone="amber" className="!font-bold">
      Demo · fictional
    </Badge>
  );
}

// ---------------------------------------------------------------- notices & states

export function Notice({ tone = 'info', title, children, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title?: string; children: ReactNode; icon?: LucideIcon }) {
  const styles = {
    info: ['bg-primary-50 border-primary-100 text-primary-900', Info],
    warning: ['bg-warning-bg border-amber-200 text-[#6b3a00]', AlertTriangle],
    danger: ['bg-danger-bg border-red-200 text-[#7a1717]', AlertTriangle],
    success: ['bg-secondary-50 border-secondary-100 text-secondary-700', CheckCircle2],
  } as const;
  const [cls, DefaultIcon] = styles[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <div className={cx('flex gap-3 rounded-xl border p-3.5 text-sm', cls)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-0.5' : undefined}>{children}</div>
      </div>
    </div>
  );
}

/** Branded loader: the MEDIMATE pin with the ripple motif. */
export function Spinner({ label = 'Loading…', full }: { label?: string; full?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-4 text-sm font-semibold text-muted', full ? 'min-h-[70dvh]' : 'py-12')} role="status">
      <span className="pulse-ring relative grid size-16 place-items-center rounded-full bg-white">
        <img src="/brand/medimate-mark.png" alt="" className="bob size-12 object-contain" />
      </span>
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-slate-200/70', className)} aria-hidden />;
}

export function EmptyState({ icon: Icon = CircleHelp, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-3d flex flex-col items-center rounded-[var(--radius-card)] bg-white px-6 py-10 text-center">
      <span className="bob mb-4 grid size-16 place-items-center rounded-2xl bg-primary-50 text-primary-600">
        <Icon className="size-8" aria-hidden />
      </span>
      <p className="font-brand text-lg font-extrabold text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Purposeful error states: premium, consent, permission, sign-in and network are explained differently. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError) {
    if (error.code === 'PREMIUM_REQUIRED') {
      return (
        <EmptyState icon={Crown} title="Part of MEDIMATE Premium" action={<LinkButton to="/app/billing">See plans</LinkButton>}>
          Your free trial has ended. Finding pharmacies, comparing prices, medicine information and contacting pharmacies stay free.
        </EmptyState>
      );
    }
    if (error.code === 'CONSENT_REQUIRED') {
      return (
        <EmptyState icon={ShieldCheck} title="Your permission is needed first" action={<LinkButton to="/app/settings#consent">Review consent</LinkButton>}>
          To store health information for you, MEDIMATE needs your consent. You can withdraw it at any time.
        </EmptyState>
      );
    }
    if (error.code === 'UNAUTHENTICATED') {
      return (
        <EmptyState icon={Lock} title="Please sign in" action={<LinkButton to="/login">Sign in</LinkButton>}>
          Your session may have ended.
        </EmptyState>
      );
    }
    if (error.status === 403) {
      return (
        <EmptyState icon={Lock} title="No access">
          {error.message}
        </EmptyState>
      );
    }
  }
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="rounded-2xl border border-red-200 bg-danger-bg/60 p-5 text-sm" role="alert">
      <p className="font-semibold text-danger">We could not load this.</p>
      <p className="mt-1 text-[#7a1717]">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function QueryView<T>({ query, children, loading }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; loading?: ReactNode }) {
  if (query.isPending) return <>{loading ?? <Spinner />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data as T)}</>;
}

// ---------------------------------------------------------------- forms

export function Field({ label, hint, error, children, optional }: { label: string; hint?: ReactNode; error?: string; optional?: boolean; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label} {optional ? <span className="font-normal text-muted">(optional)</span> : null}
      </label>
      {children(id, [hintId, errId].filter(Boolean).join(' ') || undefined)}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="flex items-center gap-1 text-xs font-medium text-danger">
          <AlertTriangle className="size-3.5" aria-hidden /> {error}
        </p>
      ) : null}
    </div>
  );
}

const inputCls =
  'block w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-3 focus:ring-primary-100 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputCls, 'min-h-11', className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cx(inputCls, 'min-h-11', className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(inputCls, 'min-h-24', className)} {...p} />;
});

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-secondary-600' : 'bg-slate-300')}
      >
        <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

export function Chip({ active, onClick, children, icon: Icon }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-10 shrink-0 select-none items-center gap-1.5 rounded-xl border-2 border-b-4 px-3.5 text-sm font-bold transition-colors active:translate-y-[2px] active:border-b-2',
        active ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-border bg-white text-ink hover:bg-sky',
      )}
    >
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-2xl border-2 border-border bg-slate-100 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx('min-h-10 rounded-xl px-4 font-brand text-sm font-extrabold transition-colors', value === it.value ? 'bg-white text-primary-700 shadow-[0_2px_0_var(--color-border)]' : 'text-muted hover:text-ink')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- dialog

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="dlg-title"
      className="m-auto w-[min(92vw,520px)] rounded-3xl border-2 border-border p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      {open ? (
        <div className="p-5">
          <h2 id="dlg-title" className="text-lg font-bold text-ink">
            {title}
          </h2>
          <div className="mt-3 text-sm text-ink">{children}</div>
          {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/** Bottom sheet on phones (centered dialog on wider screens), used for quick actions. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="sheet-title"
      className="mx-auto mb-0 mt-auto w-full max-w-lg rounded-t-[28px] border-2 border-b-0 border-border p-0 backdrop:bg-slate-900/50 sm:m-auto sm:rounded-[28px] sm:border-b-2"
    >
      {open ? (
        <div className="slide-up px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <span className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" aria-hidden />
          <h2 id="sheet-title" className="text-xl text-ink">
            {title}
          </h2>
          <div className="mt-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

// ---------------------------------------------------------------- toasts

interface ToastItem {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
}
const ToastCtx = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, tone, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'fade-in pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
              t.tone === 'error' ? 'bg-danger text-white' : t.tone === 'info' ? 'bg-ink text-white' : 'bg-secondary-700 text-white',
            )}
          >
            {t.tone === 'error' ? <XCircle className="size-4" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

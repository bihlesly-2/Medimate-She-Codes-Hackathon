import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cx } from './ui';

/** Live-text two-tone wordmark (MEDI green, MATE blue). The supplied logo mark sits beside it. */
export function Wordmark({ size = 'md', onDark, tagline, className }: { size?: 'sm' | 'md' | 'xl'; onDark?: boolean; tagline?: boolean; className?: string }) {
  const { t } = useTranslation();
  const text = { sm: 'text-xl', md: 'text-[26px]', xl: 'text-[40px] sm:text-[56px] lg:text-[64px]' }[size];
  return (
    <span className={cx('inline-flex flex-col', className)}>
      <span className={cx('wordmark', text, onDark && 'on-dark')} aria-label="MEDIMATE">
        <span className="medi">Medi</span>
        <span className="mate">mate</span>
      </span>
      {tagline ? <span className={cx('mt-1 text-xs tracking-[0.08em]', onDark ? 'text-white/85' : 'text-muted', size === 'xl' && 'text-sm sm:text-base')}>{t('tagline')}</span> : null}
    </span>
  );
}

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/medimate-mark.png"
      width={size}
      height={size}
      alt=""
      className={cx('shrink-0 rounded-xl bg-white object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function BrandLink({ to = '/', size = 'md' as 'sm' | 'md', tagline = false }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 rounded-xl" aria-label="MEDIMATE home">
      <LogoMark size={size === 'sm' ? 32 : 40} />
      <Wordmark size={size === 'sm' ? 'sm' : 'md'} tagline={tagline} />
    </Link>
  );
}

/** Subtle ECG motif used in health sections. */
export function EcgLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 24" className={cx('h-6 w-28', className)} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 12h38l6-9 8 18 7-13 4 4h57" />
    </svg>
  );
}

export function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z" />
      <circle cx="12" cy="9" r="3.2" fill="#fff" />
    </svg>
  );
}

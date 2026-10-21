import type { ReactNode } from 'react';
import { Notice } from '../../components/ui';
import { useConfig } from '../../lib/auth';

/**
 * DRAFT legal and safety copy. It must be reviewed by qualified legal, privacy and clinical advisers
 * for the operating jurisdiction before real patients use MEDIMATE. Emergency numbers are deliberately
 * NOT included — they must be supplied and approved for the region.
 */
function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div className="mt-4">
        <Notice tone="warning" title="Draft for review">
          This page is draft copy written for the MEDIMATE demo. It has not yet been reviewed by legal, privacy or clinical advisers.
        </Notice>
      </div>
      <div className="mt-6 grid gap-4 text-[15px] leading-relaxed text-ink [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </div>
  );
}

export default function Legal({ page }: { page: 'privacy' | 'terms' | 'safety' | 'support' }) {
  const { data } = useConfig();
  if (page === 'privacy') {
    return (
      <Page title="Privacy">
        <p>MEDIMATE collects only what each feature needs. Pharmacy search works without an account and without entering any health information.</p>
        <h2>What we store</h2>
        <ul>
          <li>Your phone number (your account identifier) and the name you choose to show.</li>
          <li>Only if you use those features and give consent: medicine plans you enter, reminder answers, readings, water, steps, checkups and reactions.</li>
          <li>Consent records: what you agreed to, when, the wording version and the channel (web, SMS or USSD).</li>
          <li>Message metadata for SMS/USSD. Message text is kept for 7 days for support, then deleted.</li>
        </ul>
        <h2>Who can see it</h2>
        <ul>
          <li>You. A caretaker only sees the categories you choose, and only until you stop sharing.</li>
          <li>Pharmacies only see the questions you send them, never your health records.</li>
          <li>Administrators can see operational records; their sensitive actions are written to an append-only audit log.</li>
        </ul>
        <h2>Your choices</h2>
        <ul>
          <li>Withdraw any consent in Settings, or send STOP by SMS to stop routine messages.</li>
          <li>Download all your data or delete your account from Settings.</li>
        </ul>
        <p>Reminder SMS are generic and never name a medicine or condition.</p>
      </Page>
    );
  }
  if (page === 'terms') {
    return (
      <Page title="Terms of use">
        <p>MEDIMATE is an information and reminder tool. It is not a pharmacy, a clinic or an emergency service.</p>
        <ul>
          <li>Stock and prices are reported by pharmacies and may be out of date; always confirm with the pharmacy.</li>
          <li>You are responsible for entering your prescription correctly. MEDIMATE repeats what you enter and never changes a dose.</li>
          <li>Every new account starts with a {data?.trialDays ?? 30}-day free trial. Afterwards, pharmacy search, price comparison, medicine information and pharmacy contact remain free.</li>
          <li>Premium payments are processed by a payment provider. In demo mode the checkout is a test and no money is charged.</li>
        </ul>
      </Page>
    );
  }
  if (page === 'safety') {
    return (
      <Page title="Safety">
        <p>{data?.healthDisclaimer}</p>
        <p>{data?.medicineSafetyNotice}</p>
        <ul>
          <li>MEDIMATE never diagnoses, recommends prescription medicines or changes doses.</li>
          <li>Readings are shown as you entered them, without “normal” or “abnormal” labels, because no clinically approved rule set is configured.</li>
          <li>If you feel very unwell, contact your local emergency services or go to the nearest health facility. Local emergency numbers will be listed here once they have been verified for each region.</li>
        </ul>
      </Page>
    );
  }
  return (
    <Page title="Support & contact">
      <p>For help with the app, your account or your data, contact the MEDIMATE team.</p>
      <ul>
        <li>SMS: send HELP to {data?.smsShortCode ?? 'the MEDIMATE number'} (placeholder until provisioned).</li>
        <li>USSD: dial {data?.ussdCode ?? 'the MEDIMATE code'} (placeholder until provisioned).</li>
        <li>Support contact details will be published here by the operator before launch.</li>
      </ul>
      <p>To report wrong stock or a suspicious pharmacy, use “Report a problem” on the pharmacy’s page.</p>
    </Page>
  );
}

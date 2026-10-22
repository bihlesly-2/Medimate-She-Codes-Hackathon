# Design

MEDIMATE is for people checking a pharmacy on a cheap Android phone over a slow connection, people answering a reminder between other tasks, and older relatives helping someone else. It is an installable web app, so it should feel like an app: friendly, encouraging and obvious, never like a website or a template.

## Rules, and why

| Rule | Why |
|---|---|
| **Mobile first, app-like.** Every screen is designed at 375 px, then widened. A splash screen while the app loads, a welcome screen, one-question-per-screen onboarding, then the Today screen. | Most users are on phones, and most open MEDIMATE from the home screen. |
| **Labelled bottom tab bar** on phones (Today, Reminders, Pharmacy, Readings, Me). No hamburger menu: everything else lives in the **Me** hub as grouped rows. Inside the pharmacy portal or admin, the tabs switch to that section's pages. | Icons alone are hard to learn; one obvious place for "everything else". |
| **Today path.** The day's medicines, water and steps are nodes on one path (done, now, later, missed); tapping a node opens a bottom sheet with the action. | One clear next step instead of a dashboard maze. |
| **Pressable 3D surfaces.** Buttons, chips and cards have a solid bottom edge (`.btn-3d`, `.card-3d`) that presses down on tap. No blurred drop shadows except things that float. | Feels tappable and playful (Duolingo-style) without visual noise. |
| **Celebrate real progress only.** Confetti when a dose is marked taken or onboarding finishes; streak counts come from real logs. | Encouragement works; invented numbers break trust. |
| **Grouped list rows** for collections: pharmacies, reminders, readings, payments, logs. No wide tables on phones. | Rows scan top to bottom with a thumb and stay readable at large font sizes. |
| **No decorative gradients, blobs or stock photos.** | They add weight and make health information feel like marketing. |
| **Colour has meaning.** Blue for actions and navigation, green for done, amber for streaks and "check this", red for errors. Status is always a word plus an icon, never colour alone. | Colour-blind users and bright sunlight. |
| **Atkinson Hyperlegible Next** for body text; **Nunito 800** for headings and button labels. | Atkinson was designed for low-vision readers (doses and codes); Nunito gives the friendly app voice. |
| **Plain, concrete copy.** No em dashes in UI copy, no hype, no invented numbers. | Readers with limited English or literacy. |
| **44 px minimum touch targets**, visible focus rings, skip link, reduced-motion support (all animations switch off). | Accessibility and use on the move. |
| **Honest labels.** "Demo, fictional", "Simulated, not carrier delivery", "Test checkout, no money moves", "Over 48 h old, may have changed". The assistant says it can make mistakes and never gives medical advice. | Nothing simulated or stale is dressed up as real. |

## Tokens

Defined once in [`web/src/styles/index.css`](../web/src/styles/index.css) as Tailwind v4 `@theme` variables, plus motion classes (`pop`, `bob`, `slide-up`, `pulse-ring`). White text is never placed on `#2FAE4A`; green buttons use `#1A7F37`.

## Components

[`web/src/components/ui.tsx`](../web/src/components/ui.tsx): `Button` (3D variants), `List`, `ListRow`, `ListItem`, `Card`, `Sheet` (bottom sheet), `Notice`, `StatusBadge`, `StockBadge`, `Field`, `Toggle`, `Chip`, `Tabs`, `Dialog`, `Spinner` (branded, full-screen variant), toasts, and empty, loading, error, premium and consent states. [`celebrate.ts`](../web/src/components/celebrate.ts) is the confetti burst. Charts ([`charts.tsx`](../web/src/components/charts.tsx)) are small SVGs with a text summary and a "show as table" option, and never draw normal or abnormal bands.

## Brand

The supplied logo is used as-is. The wordmark is live text: `MEDI` green, `MATE` blue, uppercase, weight 800.

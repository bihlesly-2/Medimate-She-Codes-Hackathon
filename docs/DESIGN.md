# Design

MEDIMATE is for people checking a pharmacy on a cheap Android phone over a slow connection, people answering a reminder between other tasks, and older relatives helping someone else. The interface is built for them first, and it should look like a calm, trustworthy local service, not a template.

## Rules, and why

| Rule | Why |
|---|---|
| **Mobile first.** Every screen is designed at 375 px, then widened. One column on phones; side navigation from 768 px; two-column page layouts only from 1024 px. | Most users are on phones. Desktop is the edge case. |
| **Labelled bottom tab bar** on phones (Home, Reminders, Pharmacy, Readings, Me). Inside the pharmacy portal or admin, the tabs switch to that section's pages. | Icons alone are hard to learn; labels make every destination one tap and obvious. |
| **Grouped list rows** (settings-style) for collections: pharmacies, reminders, readings, payments, logs. | Rows scan top to bottom with a thumb, wrap long text, and stay readable at large font sizes. |
| **No card grids, stat tiles or icon tiles.** Counts appear as a value at the end of a row. | Tile dashboards look generic, waste space on a phone, and invite decorative numbers. |
| **No wide tables on phones.** Tables become stacked rows. | Horizontal scrolling hides information. |
| **Flat surfaces.** White panels with a 1 px border. Shadows only on things that float (dialogs, toasts, the drawer). | Fewer visual layers, faster rendering, clearer hierarchy. |
| **No decorative gradients, blobs or stock photos.** | They add weight and make health information feel like marketing. |
| **Colour has meaning.** Blue for actions and navigation, green for done or confirmed, amber for "check this", red for errors. Status is always a word plus an icon, never colour alone. | Colour-blind users and bright sunlight. |
| **Atkinson Hyperlegible Next** for all text. Nunito 800 only for the MEDIMATE wordmark. | Designed by the Braille Institute for low-vision readers; clear distinctions between similar letters and digits matter for doses and codes. |
| **Plain, concrete copy.** "Last reported in stock 2 h ago", "Not confirmed", "Missing a day happens." No em dashes in UI copy, no hype, no invented numbers. | Readers with limited English or literacy, and honesty about what the data can and cannot say. |
| **44 px minimum touch targets**, visible focus rings, skip link, reduced-motion support. | Accessibility and use on the move. |
| **Honest labels.** "Demo, fictional", "Simulated, not carrier delivery", "Test checkout, no money moves", "Over 48 h old, may have changed". | Trust: nothing simulated or stale is dressed up as real. |

## Tokens

Defined once in [`web/src/styles/index.css`](../web/src/styles/index.css) as Tailwind v4 `@theme` variables (the brand tokens from the spec, section 2.2). White text is never placed on `#2FAE4A`; green buttons use `#1A7F37`.

## Components

[`web/src/components/ui.tsx`](../web/src/components/ui.tsx): `List`, `ListRow`, `ListItem`, `Card` (bordered panel), `Notice`, `StatusBadge`, `StockBadge`, `Field`, `Toggle`, `Chip`, `Tabs`, `Dialog` (native `<dialog>`), toasts, and purposeful empty, loading, error, premium and consent states. Charts ([`charts.tsx`](../web/src/components/charts.tsx)) are small SVGs with a text summary and a "show as table" option, and never draw normal or abnormal bands.

## Brand

The supplied logo is used as-is (cropped, not redrawn). The wordmark is live text: `MEDI` green, `MATE` blue, uppercase, weight 800. Brand motifs are used sparingly: a map pin on the pharmacy map, an ECG line on the dashboard, a ripple when a reminder is recorded as taken.

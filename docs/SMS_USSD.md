# SMS and USSD

Feature-phone users reach the same accounts and data as the web app. Commands and menus are handled by pure, unit-tested code in `shared/` (no clock, no database), wrapped by services in `server/` that do the I/O.

**Honest status.** Real SMS can be sent through Twilio (implemented and wired; trial accounts only deliver to verified numbers). Africa's Talking SMS and USSD adapters are implemented to the providers' documented formats but **not verified against a live account**. No USSD short code or SMS sender ID has been provisioned; the codes shown in the app (`*123#`, `DEMO-12345`) are placeholders. Fictional `+237 600 xxx xxx` numbers are always simulated, whatever provider is configured.

## SMS commands

Parser: [`shared/src/sms/parser.ts`](../shared/src/sms/parser.ts). Case-insensitive, extra spaces and trailing punctuation ignored. Ambiguous input is rejected with a hint instead of guessed (SUGAR and WATER need a unit). Range checks only catch typos; they never label a reading.

| Command | Example | What happens |
|---|---|---|
| `JOIN` | `JOIN` | Starts registration; asks for consent. Reply `YES` to create the account. |
| `YES` / `NO` | `YES` | Answers the pending question (join, START, or a multi-reminder choice). |
| `NAME <name>` | `NAME Ama` | Sets the display name. |
| `FIND <medicine>, <area>` | `FIND paracetamol, Molyko` | Top verified pharmacies with stock state, price and report age. Stale reports are marked. |
| `PRICE <medicine>, <area>` | `PRICE amoxicillin` | Prices among comparable, fresh reports, lowest first. |
| `INFO <medicine>` | `INFO paracetamol 500` | Short excerpt of **reviewer-verified** information with its source, or a plain "not available yet". |
| `CONTACT <code> <message>` | `CONTACT MOL1 Do you have ORS?` | Opens an inquiry in that pharmacy's inbox. |
| `TAKEN` / `SKIP` | `TAKEN` or `TAKEN RHKK` | Answers the open reminder. With several open, asks which one (by number or code). Recorded exactly once. |
| `BP <sys>/<dia>` | `BP 120/80` | Saves blood pressure in mmHg. |
| `SUGAR <value> <unit>` | `SUGAR 5.6 MMOL` or `SUGAR 101 MGDL` | Saves glucose; mg/dL converted to mmol/L and the original kept. |
| `WEIGHT <value> [kg/lb]` | `WEIGHT 68` | Saves weight in kg. |
| `WATER <amount> <unit>` | `WATER 2 GLASSES`, `WATER 500ML` | Adds water (glass 250 ml, bottle 500 ml). |
| `STEPS <number>` | `STEPS 4500` | Self-reported steps. Basic phones do not count steps; the person tells us. |
| `LANG <code>` | `LANG FR` | Switches SMS language (EN, or FR draft). Unsupported codes are refused politely. |
| `HELP` | `HELP` | Short command list. |
| `MORE` | `MORE` | Next page of a long reply. |
| `STOP` | `STOP` | Withdraws SMS consent at once; routine reminders and caretaker alerts stop. |
| `START` | `START`, then `YES` | Re-enables SMS only after an explicit `YES` (re-consent is recorded). |

Rules applied to every reply:

- Signed `MEDIMATE`, aimed at one 160-character GSM-7 segment. Longer replies are split into pages for `MORE`. Segment count and encoding (GSM-7 or UCS-2) are logged.
- Reminder SMS are generic by default ("time for your scheduled medicine", with a short reference code) and never name the medicine or condition. Caretaker alerts are generic unless the patient allowed detail.
- Message bodies are kept 7 days, then purged; metadata stays. OTP messages are never stored with their code.

## USSD menu

State machine: [`shared/src/ussd/machine.ts`](../shared/src/ussd/machine.ts). Every screen is numbered, short (target 160 characters, hard limit 182), and supports `0` Back and `00` Home.

```
Welcome to MEDIMATE
1 Find medicine/prices
2 My reminders
3 Log health
4 Contact pharmacy
5 Health tips
6 My account
```

| Branch | Screens |
|---|---|
| First session | Language pick, then registration (consent) for unknown numbers |
| 1 Find | medicine name, pick a match, area, results, pharmacy detail |
| 2 Reminders | today's open reminders, then Taken or Skip |
| 3 Log health | blood pressure (two steps), weight, water (glass, bottle, ml), steps |
| 4 Contact | pharmacy code, message |
| 5 Tips | published, reviewed tips only |
| 6 Account | language, caretaker summary, trial status |

Sessions time out after 120 seconds of inactivity. A new session never resumes on the previous screen, so a shared phone does not show the last person's data. Invalid input repeats the screen with a hint.

## Providers

The server talks to one `MessagingProvider` interface ([`server/src/providers/messaging.ts`](../server/src/providers/messaging.ts)):

| `MESSAGING_PROVIDER` | Outbound | Inbound | Status |
|---|---|---|---|
| `simulator` (default) | Nothing leaves the server; shown in the browser simulator as "Simulated" | Browser simulator | Implemented and tested |
| `twilio` | Twilio REST API (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`) | `POST /api/sms/twilio`, verified with `X-Twilio-Signature` | Implemented; signature check unit-tested; live delivery depends on your Twilio account |
| `africastalking` | Bulk SMS API | `POST /api/sms/inbound` with `x-medimate-webhook-secret` | Implemented, not verified live |

USSD gateway: `POST /api/ussd/africastalking` (form fields `sessionId`, `phoneNumber`, `text`; replies `CON ...` or `END ...`), protected by `x-medimate-webhook-secret`. Not verified against a live gateway.

### Twilio setup

1. In the Twilio console, copy the **Account SID** and **Auth Token**, and buy or use the trial phone number.
2. Set `MESSAGING_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM=+1...` (or `TWILIO_MESSAGING_SERVICE_SID`).
3. For inbound SMS (people texting commands to the Twilio number), set the number's "A message comes in" webhook to `https://<your-domain>/api/sms/twilio` (HTTP POST).
4. **Trial accounts only deliver to Verified Caller IDs.** Verify each test phone in the console (Phone Numbers, Verified Caller IDs). Trial messages start with a Twilio trial prefix. Twilio numbers from the US cannot always reach Cameroonian operators reliably; a local sender ID or a local provider is a production gate.

With a live provider set, phone sign-in codes for real numbers go out by SMS; fictional `+237 600` numbers still show their code on screen and never send.

## Browser simulator

`/simulator` (only when `DEMO_MODE=true`) gives a basic-phone frame for SMS and USSD, quick commands, scripted journeys, a reset button, and "Run reminder engine now". It uses the real command engine and the same database, so a reminder answered by SMS shows up on the web dashboard. It is labelled "Simulated, not carrier delivery" everywhere. On the public demo it accepts only fictional numbers.

Scripted journeys in the simulator:

- **Register + find + log:** `JOIN`, `YES`, `FIND paracetamol, Molyko`, `2`, `PRICE amoxicillin`, `INFO paracetamol 500`, `WATER 2 GLASSES`, `STEPS 4500`, `BP 120/80`, `HELP`
- **Reminder answer:** `TAKEN` (use Ama, `600000001`, after "Run reminder engine now")
- **Opt out and back in:** `STOP`, `START`, `YES`
- **USSD:** find medicine, log water, Back and Home navigation, simulated timeout

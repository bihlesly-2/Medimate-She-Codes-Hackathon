import type { MessageLang } from '../constants';

/**
 * SMS/USSD message catalogue.
 * - `en` is the authored base language.
 * - `fr` is an UNREVIEWED DRAFT written for demonstration. It must be reviewed by a qualified
 *   translator before production. Strings avoid characters outside GSM-7 (ç, ê, î, ô…) to keep
 *   SMS at 160 characters per segment.
 * Missing keys fall back to English deterministically.
 */
const en = {
  help: 'FIND med,area | PRICE med,area | INFO med | CONTACT code msg | TAKEN | SKIP | BP 120/80 | WATER 500ML | STEPS 4500 | LANG FR | STOP',
  unknown: 'Sorry, we did not understand that. {hint}',
  join_prompt: 'MEDIMATE stores the reminders and health logs you send and texts you reminders. Privacy: {privacyUrl}. Reply YES to agree, NO to cancel.',
  join_done: 'You are registered. Your {days}-day free trial has started. Send HELP for commands. Optional: reply NAME and your first name.',
  join_already: 'This number is already registered. Send HELP for commands.',
  join_cancelled: 'OK, nothing was saved. Send JOIN any time.',
  need_join: 'Please register first: send JOIN.',
  need_health_consent: 'Health logging is off for your account. Turn it on in MEDIMATE settings first.',
  premium_required: 'This needs MEDIMATE Premium. Still free: FIND, PRICE, INFO, CONTACT.',
  med_unknown: 'We could not find "{query}" in the MEDIMATE list. Please check the spelling.',
  med_ambiguous: 'Which one? {options}. Reply with the number.',
  find_none: 'No verified pharmacy has recently reported {medicine}{area}. Try another area.',
  find_header: '{medicine}, last reported:',
  price_header: '{medicine}, prices as last reported:',
  stale_note: 'OLD',
  info_none: 'Reviewed information for {medicine} is not available yet. Please ask a pharmacist.',
  info: '{medicine}: {excerpt} Source: {source}, reviewed {date}. Ask a pharmacist if unsure.',
  contact_unknown: 'No verified pharmacy uses the code {code}.',
  contact_need_message: 'Send CONTACT {code} followed by your question.',
  contact_sent: 'Your message was sent to {pharmacy}. Their reply will come by SMS. Phone: {phone}',
  reminder_none: 'You have no open reminders right now.',
  reminder_ambiguous: 'You have {count} open reminders: {list}. Reply TAKEN or SKIP with the code, e.g. TAKEN {example}.',
  reminder_unknown_ref: 'No open reminder has the code {ref}.',
  reminder_taken: 'Recorded as taken ({ref}). Thank you.',
  reminder_skipped: 'Recorded as skipped ({ref}).',
  reminder_already: 'Reminder {ref} was already recorded as {status}.',
  vital_saved_note: 'MEDIMATE does not interpret readings. Talk to a health worker if you are concerned.',
  bp_saved: 'Saved: blood pressure {systolic}/{diastolic} mmHg.',
  sugar_saved: 'Saved: blood glucose {value} {unit}.',
  weight_saved: 'Saved: weight {kg} kg.',
  water_saved: 'Added {ml} ml. Today: {total} ml of your {target} ml target. Needs vary from person to person.',
  steps_saved: 'Added {count} steps. Today: {total} of your {goal} goal.',
  lang_set: 'Language set to {lang}.',
  lang_unsupported: 'That language is not available yet. Available: {available}.',
  stop_done: 'You will no longer get routine MEDIMATE SMS. Send START to turn them back on.',
  start_prompt: 'To get MEDIMATE reminder SMS again, reply YES. Reply NO to keep them off.',
  start_done: 'Reminder SMS are back on.',
  start_kept_off: 'OK, reminder SMS stay off.',
  more_none: 'There is nothing more to show.',
  name_set: 'Thanks, {name}. Your name is saved.',
  choose_invalid: 'Please reply with one of the numbers offered.',
  nothing_pending: 'Nothing to confirm. Send HELP for commands.',
  reminder_sms: 'MEDIMATE reminder {ref}: it is time for your scheduled medicine. Reply TAKEN or SKIP.',
  reminder_followup_sms: 'MEDIMATE: reminder {ref} is not confirmed yet. Reply TAKEN or SKIP.',
  refill_sms: 'MEDIMATE: the refill date you set is {date}.',
  checkup_sms: 'MEDIMATE: you have a checkup on {date} at {time}.',
  caretaker_alert_sms: 'MEDIMATE: a reminder for {name} is not confirmed yet. You may want to check in.',
  pharmacy_reply_sms: 'MEDIMATE: reply from {pharmacy}: {body}',
  otp_sms: 'Your MEDIMATE code is {code}. It expires in 5 minutes. Never share it.',

  ussd_lang_pick: 'Welcome to MEDIMATE\nChoose language:\n1 English\n2 Francais (draft)',
  ussd_home: 'Welcome to MEDIMATE\n1 Find medicine/prices\n2 My reminders\n3 Log health\n4 Contact pharmacy\n5 Health tips\n6 My account',
  ussd_nav: '0 Back 00 Home',
  ussd_invalid: 'Invalid choice.',
  ussd_expired: 'Session expired. Starting again.',
  ussd_find_query: 'Enter medicine name:',
  ussd_find_area: 'Enter area or town.\n1 Any area',
  ussd_find_pick: 'Which one?',
  ussd_find_none: 'No verified pharmacy has recently reported this medicine.',
  ussd_find_results: 'Last reported:',
  ussd_detail: '{name} ({code})\n{area}\nCall {phone}\n1 Send a message',
  ussd_rem_none: 'No open reminders today.',
  ussd_rem_list: 'Open reminders today:',
  ussd_rem_action: 'Reminder {ref} at {time}\n1 Taken\n2 Skip',
  ussd_log_menu: 'Log health\n1 Blood pressure\n2 Weight (kg)\n3 Water\n4 Steps',
  ussd_log_bp_sys: 'Blood pressure\nEnter the top number (e.g. 120):',
  ussd_log_bp_dia: 'Enter the bottom number (e.g. 80):',
  ussd_log_weight: 'Enter weight in kg:',
  ussd_log_water: 'Water amount:\n1 One glass (250 ml)\n2 One bottle (500 ml)\n3 Other amount',
  ussd_log_water_ml: 'Enter amount in ml:',
  ussd_log_steps: 'Enter steps to add:',
  ussd_bad_value: 'Please check the value and try again.',
  ussd_contact_code: 'Enter pharmacy code (shown in search results):',
  ussd_contact_msg: 'Type your message to {pharmacy}:',
  ussd_tip: '{title}: {body}\n1 Next tip',
  ussd_tip_none: 'No reviewed health tips yet.',
  ussd_account: 'My account\n1 Language\n2 Plan status\n3 Caretakers',
  ussd_plan: 'Plan: {tier}. {detail}',
  ussd_plan_trial: 'Trial ends in {days} days.',
  ussd_plan_premium: 'Premium active for {days} more days.',
  ussd_plan_free: 'Free tools: find medicine, prices, contact pharmacy.',
  ussd_care: 'Linked caretakers: {count}. Manage sharing in the MEDIMATE web app.',
  ussd_register: 'Not registered.\nMEDIMATE stores your reminders and health logs and sends SMS reminders.\n1 Agree and register\n2 Cancel',
  ussd_registered: 'Registered. Your {days}-day free trial has started.',
  ussd_need_register: 'Please register first: choose 6 My account.',
  ussd_goodbye: 'Thank you for using MEDIMATE.',
} as const;

export type MessageKey = keyof typeof en;

const fr: Partial<Record<MessageKey, string>> = {
  help: 'FIND med,quartier | PRICE med,quartier | INFO med | CONTACT code msg | TAKEN | SKIP | BP 120/80 | WATER 500ML | STEPS 4500 | LANG EN | STOP',
  unknown: "Desole, nous n'avons pas compris. {hint}",
  join_done: "Vous etes inscrit. Votre essai gratuit de {days} jours commence. Envoyez HELP pour l'aide.",
  need_join: "Inscrivez-vous d'abord: envoyez JOIN.",
  premium_required: 'Ceci demande MEDIMATE Premium. Toujours gratuit: FIND, PRICE, INFO, CONTACT.',
  reminder_none: "Vous n'avez aucun rappel ouvert.",
  reminder_taken: 'Pris: enregistre ({ref}). Merci.',
  reminder_skipped: 'Saute: enregistre ({ref}).',
  lang_set: 'Langue: {lang}.',
  stop_done: 'Vous ne recevrez plus les SMS de routine MEDIMATE. Envoyez START pour les reactiver.',
  reminder_sms: 'Rappel MEDIMATE {ref}: il est l\'heure de votre medicament prevu. Repondez TAKEN ou SKIP.',
  ussd_lang_pick: 'Bienvenue sur MEDIMATE\nChoisir la langue:\n1 English\n2 Francais (brouillon)',
  ussd_home: 'Bienvenue sur MEDIMATE\n1 Trouver un medicament\n2 Mes rappels\n3 Noter ma sante\n4 Contacter pharmacie\n5 Conseils sante\n6 Mon compte',
  ussd_nav: '0 Retour 00 Accueil',
  ussd_invalid: 'Choix invalide.',
  ussd_expired: 'Session expiree. On recommence.',
  ussd_find_query: 'Nom du medicament:',
  ussd_find_area: 'Quartier ou ville.\n1 Partout',
  ussd_rem_none: "Aucun rappel ouvert aujourd'hui.",
  ussd_log_menu: 'Noter ma sante\n1 Tension\n2 Poids (kg)\n3 Eau\n4 Pas',
  ussd_account: 'Mon compte\n1 Langue\n2 Mon forfait\n3 Aidants',
  ussd_goodbye: "Merci d'utiliser MEDIMATE.",
};

const catalogues: Record<MessageLang, Partial<Record<MessageKey, string>>> = { en, fr };

export function msg(lang: MessageLang | string | null | undefined, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const table = catalogues[(lang ?? 'en') as MessageLang] ?? en;
  const template = table[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

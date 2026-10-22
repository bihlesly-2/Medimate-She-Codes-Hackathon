import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { localDate, localTime, pharmacySearchSchema, VITAL_LABELS, VITAL_TYPES, type VitalType } from '@medimate/shared';
import { careLinks } from '../db/schema';
import { AppError } from '../lib/errors';
import type { Deps } from '../types';
import { notifyUser } from './notify';
import { searchOffers } from './pharmacy';
import { confirmOccurrence, listOccurrences, openOccurrences } from './reminders';
import { activitySummary, addSteps, addVital, addWater } from './tracking';
import { assertConsent, assertFeature, getUser } from './users';

/**
 * MEDIMATE assistant (Claude). It helps people use the app in plain words: log water, steps and
 * readings, answer a medicine reminder, find a medicine, and tell their caretakers something.
 * Every tool runs as the signed-in person through the same services, permission and consent checks
 * as the app. It never diagnoses, interprets readings or talks about doses.
 */

const SYSTEM = `You are the MEDIMATE assistant, a friendly helper inside a health app used in Cameroon (Buea and nearby). Many users are older or not confident with phones.

What you do:
- Help people log water, steps and health readings, answer their medicine reminder (taken or skipped), see today's plan, find which verified pharmacy has a medicine and its price, and send a short message to their caretakers.
- Use the tools to do these things. After a tool succeeds, confirm in one short sentence what was saved.
- If something is ambiguous (for example "I drank water" with no amount, or a reading without a unit), ask one short question. A glass is 250 ml and a bottle is 500 ml.

Safety rules you always follow:
- Never diagnose, never say a reading is normal, high, low or dangerous, and never interpret symptoms.
- Never recommend a medicine, never suggest, change or comment on a dose. Medicines come only from the person's own prescription.
- If someone describes feeling very unwell, chest pain, trouble breathing, fainting, severe bleeding or thoughts of self-harm, tell them to contact local emergency services or go to the nearest health facility now, and offer to message their caretakers. Do not invent phone numbers.
- For any health question, say a pharmacist or health worker is the right person to ask.

Style: short, warm, plain words. Reply in the language the person writes in (English or French). No markdown headings or tables.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_today',
    description: "Get the person's plan and progress for today: medicine reminders with times and status, water and steps so far against their goals.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'log_water',
    description: 'Record water the person drank. Convert glasses (250 ml) and bottles (500 ml) to millilitres.',
    input_schema: { type: 'object', properties: { amount_ml: { type: 'integer', description: 'Millilitres, 50 to 3000' } }, required: ['amount_ml'], additionalProperties: false },
  },
  {
    name: 'log_steps',
    description: 'Record steps the person walked today.',
    input_schema: { type: 'object', properties: { steps: { type: 'integer', description: 'Number of steps, 1 to 60000' } }, required: ['steps'], additionalProperties: false },
  },
  {
    name: 'log_reading',
    description: 'Record a health reading exactly as the person gave it. Blood pressure uses value (top number) and value2 (bottom number) in mmHg. Glucose unit is mmol/L or mg/dL. Weight kg or lb. Height cm. Heart rate bpm. Temperature °C or °F. Do not comment on the value.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...VITAL_TYPES] },
        value: { type: 'number' },
        value2: { type: 'number', description: 'Only for blood pressure: the bottom number' },
        unit: { type: 'string' },
      },
      required: ['type', 'value', 'unit'],
      additionalProperties: false,
    },
  },
  {
    name: 'answer_reminder',
    description: 'Answer the medicine reminder that is due now: taken or skipped. Only use when the person clearly says they took or skipped their medicine.',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['taken', 'skipped'] } }, required: ['action'], additionalProperties: false },
  },
  {
    name: 'find_medicine',
    description: 'Find verified pharmacies that recently reported a medicine, with price and stock. Use the medicine name the person gave.',
    input_schema: { type: 'object', properties: { medicine: { type: 'string' } }, required: ['medicine'], additionalProperties: false },
  },
  {
    name: 'message_caretakers',
    description: "Send a short message from the person to their linked caretakers (family members they invited). Only when the person asks to tell or alert their family or caretaker.",
    input_schema: { type: 'object', properties: { message: { type: 'string', description: 'Up to 300 characters, in the person’s words' } }, required: ['message'], additionalProperties: false },
  },
];

const INPUTS = {
  get_today: z.object({}).strict(),
  log_water: z.object({ amount_ml: z.number().int().min(50).max(3000) }),
  log_steps: z.object({ steps: z.number().int().min(1).max(60000) }),
  log_reading: z.object({ type: z.enum(VITAL_TYPES), value: z.number(), value2: z.number().optional(), unit: z.string().max(10) }),
  answer_reminder: z.object({ action: z.enum(['taken', 'skipped']) }),
  find_medicine: z.object({ medicine: z.string().min(2).max(60) }),
  message_caretakers: z.object({ message: z.string().min(1).max(300) }),
} as const;
type ToolName = keyof typeof INPUTS;

export interface AssistantAction {
  tool: ToolName;
  summary: string;
}

async function runTool(deps: Deps, userId: string, name: ToolName, raw: unknown): Promise<{ text: string; action?: AssistantAction }> {
  const parsed = INPUTS[name].safeParse(raw);
  if (!parsed.success) return { text: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}` };
  const input = parsed.data as Record<string, unknown>;
  const user = (await getUser(deps.db, userId))!;
  const tz = user.timezone;
  switch (name) {
    case 'get_today': {
      const lines: string[] = [];
      try {
        await assertFeature(deps, userId, 'reminders');
        const occ = (await listOccurrences(deps, userId, 'today')).filter((o) => o.kind === 'medication');
        lines.push(occ.length ? `Medicines today: ${occ.map((o) => `${o.localTime} ${o.plan?.medicineName ?? 'medicine'} (${o.status})`).join(', ')}.` : 'No medicine reminders today.');
      } catch {
        lines.push('Medicine reminders are not available on this plan.');
      }
      for (const kind of ['water', 'steps'] as const) {
        try {
          await assertFeature(deps, userId, kind);
          const s = await activitySummary(deps, userId, kind, 1);
          lines.push(kind === 'water' ? `Water: ${s.todayTotal} of ${s.goal} ml.` : `Steps: ${s.todayTotal} of ${s.goal}.`);
        } catch {
          /* feature locked: say nothing */
        }
      }
      return { text: lines.join(' ') };
    }
    case 'log_water': {
      await assertFeature(deps, userId, 'water');
      await assertConsent(deps.db, userId, 'health_data');
      await addWater(deps, userId, input.amount_ml as number);
      const s = await activitySummary(deps, userId, 'water', 1);
      return { text: `Saved ${input.amount_ml} ml. Today: ${s.todayTotal} of ${s.goal} ml.`, action: { tool: name, summary: `Water +${input.amount_ml} ml` } };
    }
    case 'log_steps': {
      await assertFeature(deps, userId, 'steps');
      await assertConsent(deps.db, userId, 'health_data');
      await addSteps(deps, userId, localDate(deps.clock.now(), tz), input.steps as number);
      const s = await activitySummary(deps, userId, 'steps', 1);
      return { text: `Saved ${input.steps} steps. Today: ${s.todayTotal} of ${s.goal}.`, action: { tool: name, summary: `Steps +${input.steps}` } };
    }
    case 'log_reading': {
      await assertFeature(deps, userId, 'vitals');
      await assertConsent(deps.db, userId, 'health_data');
      const type = input.type as VitalType;
      const v = await addVital(deps, userId, { type, value: input.value as number, value2: (input.value2 as number | undefined) ?? null, unit: input.unit as string, note: null });
      const shown = type === 'bp' ? `${v.value}/${v.value2}` : String(v.value);
      return { text: `Saved ${VITAL_LABELS[type]}: ${shown} ${v.unit}.`, action: { tool: name, summary: `${VITAL_LABELS[type]} ${shown} ${v.unit}` } };
    }
    case 'answer_reminder': {
      await assertFeature(deps, userId, 'reminders');
      const open = await openOccurrences(deps, userId);
      if (!open.length) return { text: 'There is no medicine reminder waiting for an answer right now.' };
      const o = open[0]!;
      const r = await confirmOccurrence(deps, userId, o.id, input.action as 'taken' | 'skipped', 'web');
      const time = localTime(o.scheduledFor, tz);
      return {
        text: r.result === 'already' ? `The ${time} reminder was already answered (${r.status}).` : `Recorded the ${time} reminder as ${input.action}.${open.length > 1 ? ` ${open.length - 1} more reminder(s) are still waiting.` : ''}`,
        action: { tool: name, summary: `${time} medicine: ${input.action}` },
      };
    }
    case 'find_medicine': {
      const res = await searchOffers(deps, pharmacySearchSchema.parse({ q: input.medicine, sort: 'price', limit: 3 }));
      if (res.unknownMedicine) return { text: `No medicine called "${input.medicine}" is in the catalogue. Ask for the generic name.` };
      if (!res.items.length) return { text: 'No verified pharmacy reported it in the last 48 hours.' };
      return {
        text: res.items.map((o) => `${o.pharmacy.name} (${o.pharmacy.area}): ${o.price === null ? 'price not listed' : `${o.price} FCFA`}, ${o.stockState.replace('_', ' ')}, reported ${o.ageLabel}`).join('\n') + '\nTell the person to call before going; the Find screen shows directions.',
      };
    }
    case 'message_caretakers': {
      const active = (await deps.db.select().from(careLinks).where(eq(careLinks.patientId, userId))).filter((l) => l.status === 'active' && l.caretakerId);
      if (!active.length) return { text: 'This person has no active caretakers yet. They can invite one from Me > My caretakers.' };
      const first = user.displayName?.split(' ')[0] ?? 'Your contact';
      for (const l of active) {
        await notifyUser(deps, l.caretakerId!, { kind: 'caretaker', title: `Message from ${first}`, body: String(input.message), url: `/care/${userId}` });
      }
      return { text: `Sent to ${active.length} caretaker(s).`, action: { tool: name, summary: `Told ${active.length} caretaker(s)` } };
    }
  }
}

export const assistantMessageSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(20)
    .refine((m) => m[0]!.role === 'user' && m.at(-1)!.role === 'user', 'Conversation must start and end with the person’s message.'),
});

let client: Anthropic | null = null;

export async function assistantReply(deps: Deps, userId: string, history: z.infer<typeof assistantMessageSchema>['messages']) {
  const key = deps.config.ANTHROPIC_API_KEY;
  if (!key) throw new AppError(404, 'NOT_CONFIGURED', 'The assistant is not set up on this server yet.');
  client ??= new Anthropic({ apiKey: key });
  const user = await getUser(deps.db, userId);
  const context = `The person is ${user?.displayName ?? 'a MEDIMATE user'}. Their local time is ${localTime(deps.clock.now(), user?.timezone ?? 'Africa/Douala')} on ${localDate(deps.clock.now(), user?.timezone ?? 'Africa/Douala')}.`;

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const actions: AssistantAction[] = [];

  for (let step = 0; step < 5; step++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: deps.config.ASSISTANT_MODEL,
        max_tokens: 2000,
        // The stable instructions are cached; per-request facts come after the breakpoint.
        system: [
          { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: context },
        ],
        tools: TOOLS,
        output_config: { effort: 'low' },
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new AppError(429, 'ASSISTANT_BUSY', 'The assistant is busy. Please try again in a minute.');
      if (err instanceof Anthropic.APIError) {
        deps.logger.error('assistant_api_error', { status: err.status, message: err.message });
        throw new AppError(502, 'ASSISTANT_UNAVAILABLE', 'The assistant is not available right now.');
      }
      throw err;
    }

    if (response.stop_reason === 'refusal') {
      return { reply: 'I can’t help with that here. For health questions, please ask a pharmacist or health worker.', actions };
    }
    if (response.stop_reason !== 'tool_use') {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { reply: reply || 'Done.', actions };
    }

    messages.push({ role: 'assistant', content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const name = block.name as ToolName;
      if (!(name in INPUTS)) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Unknown tool.', is_error: true });
        continue;
      }
      try {
        const r = await runTool(deps, userId, name, block.input);
        if (r.action) actions.push(r.action);
        results.push({ type: 'tool_result', tool_use_id: block.id, content: r.text });
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'That did not work.';
        results.push({ type: 'tool_result', tool_use_id: block.id, content: msg, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Sorry, that took too many steps. Please try again with one thing at a time.', actions };
}

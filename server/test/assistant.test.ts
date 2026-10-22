import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, PHONES, setup } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
}, 60_000);
afterAll(async () => {
  await ctx.database.close();
});

describe('assistant', () => {
  it('needs a signed-in person', async () => {
    const r = await (await import('supertest')).default(ctx.app).post('/api/assistant').send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r.status).toBe(401);
  });

  it('rejects a conversation that does not end with the person', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const r = await ama.post('/api/assistant').send({ messages: [{ role: 'assistant', content: 'hello' }] });
    expect(r.status).toBe(400);
  });

  it('says it is not configured when there is no AI key', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const r = await ama.post('/api/assistant').send({ messages: [{ role: 'user', content: 'I drank water' }] });
    expect(r.status).toBe(404);
  });
});

import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { loadConfig } from '../src/config';
import { twilioProvider, validTwilioSignature } from '../src/providers/messaging';
import { verifyFirebaseIdToken } from '../src/services/firebase';

describe('Twilio', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_SECRET: 'x'.repeat(40),
    MESSAGING_PROVIDER: 'twilio',
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'secret-token',
    TWILIO_FROM: '+15005550006',
  });

  it('sends with basic auth and form fields, and reports failures honestly', async () => {
    const seen: { url: string; auth: string; body: string }[] = [];
    const ok = twilioProvider(config, (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: (init.headers as Record<string, string>).Authorization!, body: String(init.body) });
      return new Response(JSON.stringify({ sid: 'SM123', status: 'queued' }), { status: 201 });
    }) as never);
    const r = await ok.send({ to: '+237670000001', body: 'Hello' });
    expect(r).toEqual({ status: 'sent', providerMessageId: 'SM123' });
    expect(seen[0]!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json');
    expect(seen[0]!.auth).toBe(`Basic ${Buffer.from('AC_test:secret-token').toString('base64')}`);
    expect(seen[0]!.body).toContain('To=%2B237670000001');
    const bad = twilioProvider(config, (async () => new Response(JSON.stringify({ code: 21608, message: 'unverified number' }), { status: 400 })) as never);
    const f = await bad.send({ to: '+237670000001', body: 'Hello' });
    expect(f.status).toBe('failed');
    expect(f.error).toMatch(/21608/);
  });

  it('validates inbound webhook signatures and rejects tampering', () => {
    const url = 'https://medimate.example/api/sms/twilio';
    const params = { From: '+237670000001', Body: 'HELP', To: '+15005550006' };
    const data = url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join('');
    const sig = createHmac('sha1', 'secret-token').update(data).digest('base64');
    expect(validTwilioSignature('secret-token', url, params, sig)).toBe(true);
    expect(validTwilioSignature('secret-token', url, { ...params, Body: 'STOP' }, sig)).toBe(false);
    expect(validTwilioSignature('other-token', url, params, sig)).toBe(false);
  });
});

describe('Firebase ID token verification', () => {
  it('accepts a correctly signed token for the project and rejects wrong audience or issuer', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const now = Math.floor(Date.now() / 1000);
    const sign = (aud: string, iss: string) =>
      new SignJWT({ email: 'Ama@Example.org', email_verified: true, auth_time: now - 10, firebase: { sign_in_provider: 'password' } })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject('uid-123')
        .setAudience(aud)
        .setIssuer(iss)
        .setIssuedAt(now - 10)
        .setExpirationTime(now + 3600)
        .sign(privateKey);
    const good = await sign('medimate-demo', 'https://securetoken.google.com/medimate-demo');
    const id = await verifyFirebaseIdToken(good, 'medimate-demo', new Date(), keys);
    expect(id).toMatchObject({ uid: 'uid-123', email: 'ama@example.org', emailVerified: true, provider: 'password' });
    await expect(verifyFirebaseIdToken(await sign('other-project', 'https://securetoken.google.com/other-project'), 'medimate-demo', new Date(), keys)).rejects.toThrow();
    await expect(verifyFirebaseIdToken(await sign('medimate-demo', 'https://evil.example'), 'medimate-demo', new Date(), keys)).rejects.toThrow();
  });
});

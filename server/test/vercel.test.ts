import { describe, expect, it } from 'vitest';
import { restoreOriginalUrl } from '../src/vercel';

describe('Vercel entry: original API path', () => {
  it('rebuilds the path when the function receives the rewritten URL', () => {
    expect(restoreOriginalUrl('/api?__path=pharmacies/search&q=paracetamol')).toBe('/api/pharmacies/search?q=paracetamol');
    expect(restoreOriginalUrl('/api?__path=auth/me')).toBe('/api/auth/me');
  });

  it('keeps an original path and only drops the helper parameter', () => {
    expect(restoreOriginalUrl('/api/pharmacies/search?q=ors&__path=pharmacies/search')).toBe('/api/pharmacies/search?q=ors');
    expect(restoreOriginalUrl('/api/health')).toBe('/api/health');
  });

  it('encodes path segments taken from the query', () => {
    expect(restoreOriginalUrl('/api?__path=medicines/a b')).toBe('/api/medicines/a%20b');
  });
});

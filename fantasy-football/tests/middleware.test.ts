import { describe, expect, it } from 'vitest';
import { constantTimeEquals } from '@/middleware';

describe('constantTimeEquals', () => {
  it('matches identical strings', () => {
    expect(constantTimeEquals('hunter2', 'hunter2')).toBe(true);
    expect(constantTimeEquals('', '')).toBe(true);
  });

  it('rejects different strings', () => {
    expect(constantTimeEquals('hunter2', 'hunter3')).toBe(false);
    expect(constantTimeEquals('hunter2', '')).toBe(false);
    expect(constantTimeEquals('', 'hunter2')).toBe(false);
  });

  it('rejects a prefix rather than accepting it', () => {
    expect(constantTimeEquals('hunter', 'hunter2')).toBe(false);
    expect(constantTimeEquals('hunter2', 'hunter')).toBe(false);
  });

  it('handles non-ASCII passwords', () => {
    expect(constantTimeEquals('pässwörd', 'pässwörd')).toBe(true);
    expect(constantTimeEquals('pässwörd', 'password')).toBe(false);
  });
});

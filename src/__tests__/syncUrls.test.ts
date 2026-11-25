import { describe, expect, it } from 'vitest';
import {
  buildMagicInviteUrl,
  normalizeAppsScriptUrl,
  parseJoinRoute,
  resolveEffectiveAppsScriptUrl,
} from '../utils/syncUrls';

describe('syncUrls utilities', () => {
  it('validates HTTPS and localhost Apps Script URLs while rejecting unsafe schemes', () => {
    expect(
      normalizeAppsScriptUrl('  https://script.google.com/macros/s/abc123/exec  '),
    ).toBe('https://script.google.com/macros/s/abc123/exec');
    expect(normalizeAppsScriptUrl('http://localhost:8787/exec')).toBe(
      'http://localhost:8787/exec',
    );
    expect(normalizeAppsScriptUrl('http://127.0.0.1:8787/exec')).toBe(
      'http://127.0.0.1:8787/exec',
    );
    expect(normalizeAppsScriptUrl('http://example.com/exec')).toBe('');
    expect(normalizeAppsScriptUrl('javascript:alert(1)')).toBe('');
    expect(normalizeAppsScriptUrl('not a url')).toBe('');
  });

  it('builds and parses Magic Invite URLs (?join=1&api=...&code=...)', () => {
    const api = 'https://script.google.com/macros/s/AKfycbTest/exec';
    const inviteUrl = buildMagicInviteUrl(
      'https://family.github.io/gazette/?old=1#section',
      api,
      'FAM-2026',
    );

    const parsed = parseJoinRoute(new URL(inviteUrl).search);
    expect(parsed).toEqual({
      appsScriptUrl: api,
      inviteCode: 'FAM-2026',
    });

    expect(parseJoinRoute('')).toBeNull();
    expect(parseJoinRoute('?join=0&api=https://script.google.com/a/exec&code=X')).toBeNull();
    expect(parseJoinRoute('?join=1&api=http://insecure.example/exec&code=X')).toBeNull();
    expect(parseJoinRoute('?join=1&api=https://script.google.com/a/exec&code=   ')).toBeNull();
  });

  it('resolves effective relay URL using route -> config -> env fallback precedence', () => {
    const routeApi = 'https://script.google.com/macros/s/route/exec';
    const configApi = 'https://script.google.com/macros/s/config/exec';
    const envApi = 'https://script.google.com/macros/s/env/exec';

    expect(resolveEffectiveAppsScriptUrl(routeApi, configApi, envApi)).toBe(routeApi);
    expect(resolveEffectiveAppsScriptUrl('bad-url', configApi, envApi)).toBe(configApi);
    expect(resolveEffectiveAppsScriptUrl(undefined, '', envApi)).toBe(envApi);
    expect(resolveEffectiveAppsScriptUrl('', '', '')).toBe('');
  });
});

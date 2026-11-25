export function normalizeAppsScriptUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp =
      parsed.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1');
    if (!isHttps && !isLocalHttp) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function buildMagicInviteUrl(
  baseOriginAndPath: string,
  appsScriptUrl: string,
  inviteCode: string,
): string {
  const normalizedApi = normalizeAppsScriptUrl(appsScriptUrl);
  const cleanCode = inviteCode.trim();
  const cleanBase = baseOriginAndPath.split('#')[0].split('?')[0];
  if (!normalizedApi || !cleanCode) return cleanBase;
  const params = new URLSearchParams();
  params.set('join', '1');
  params.set('api', normalizedApi);
  params.set('code', cleanCode);
  return `${cleanBase}?${params.toString()}`;
}

export interface JoinRouteParams {
  appsScriptUrl: string;
  inviteCode: string;
}

export function parseJoinRoute(search: string): JoinRouteParams | null {
  const trimmed = search.trim();
  if (!trimmed) return null;
  const query = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  const params = new URLSearchParams(query);
  if (params.get('join') !== '1') return null;

  const appsScriptUrl = normalizeAppsScriptUrl(params.get('api') || '');
  const inviteCode = (params.get('code') || '').trim();
  if (!appsScriptUrl || !inviteCode) return null;

  return {
    appsScriptUrl,
    inviteCode,
  };
}

export function resolveEffectiveAppsScriptUrl(
  routeApiUrl?: string | null,
  configuredUrl?: string | null,
  envUrl?: string | null,
): string {
  for (const candidate of [routeApiUrl, configuredUrl, envUrl]) {
    if (!candidate) continue;
    const normalized = normalizeAppsScriptUrl(candidate);
    if (normalized) return normalized;
  }
  return '';
}

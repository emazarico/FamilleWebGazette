import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import {
  fetchPublicGazetteFromRelay,
  fetchPublicMediaFromRelay,
} from '../../services/appsScriptSync';
import { SyncApiError } from '../../services/syncAdapter';
import { registerRemoteMediaFetcher } from '../../services/mediaStore';
import { useFamily } from '../../store/FamilyContext';
import {
  buildScopedGazettePayload,
  validateGazetteSecretAccess,
  type GazetteRouteParams,
  type ScopedGazettePayload,
} from '../../utils/gazette';
import { resolveEffectiveAppsScriptUrl } from '../../utils/syncUrls';
import { PrintGazetteView } from './PrintGazetteView';

interface PublicGazetteReaderProps {
  route: GazetteRouteParams;
  onExitToApp: () => void;
}

type PublicErrorReason = 'not_found' | 'invalid_key' | 'revoked' | 'expired';

function mapSyncErrorToReason(err: unknown): PublicErrorReason {
  if (err instanceof SyncApiError) {
    if (err.code === 'UNAUTHORIZED') return 'invalid_key';
    if (err.code === 'FORBIDDEN') {
      return /revoked/i.test(err.message) ? 'revoked' : 'expired';
    }
  }
  return 'not_found';
}

export const PublicGazetteReader: React.FC<PublicGazetteReaderProps> = ({
  route,
  onExitToApp,
}) => {
  const { db, hydrated, syncConfig, language, setLanguage, tr } = useFamily();

  const [remotePayload, setRemotePayload] = useState<ScopedGazettePayload | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<PublicErrorReason | null>(null);

  const effectiveApiUrl = useMemo(
    () =>
      resolveEffectiveAppsScriptUrl(
        route.apiUrl,
        syncConfig.appsScriptUrl,
        import.meta.env.VITE_APPS_SCRIPT_URL,
      ),
    [route.apiUrl, syncConfig.appsScriptUrl],
  );

  const localIssue = useMemo(
    () => db.gazettes.find((g) => g.id === route.issueId && !g.deletedAt),
    [db.gazettes, route.issueId],
  );

  const localAccess = useMemo(
    () => validateGazetteSecretAccess(localIssue, route.secretKey),
    [localIssue, route.secretKey],
  );

  const localPayload = useMemo(() => {
    if (!localIssue || !localAccess.ok) return null;
    return buildScopedGazettePayload(db, localIssue);
  }, [db, localIssue, localAccess.ok]);

  // Fall back to remote Google Apps Script relay when local cache lacks the issue
  // or if a previously expired/revoked local snapshot was reactivated on the server.
  useEffect(() => {
    if (!hydrated || localPayload || !effectiveApiUrl) return;
    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError(null);

    void fetchPublicGazetteFromRelay(effectiveApiUrl, route.issueId, route.secretKey)
      .then((res) => {
        if (!cancelled) {
          setRemotePayload(res.payload);
          setRemoteLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRemotePayload(null);
          setRemoteError(mapSyncErrorToReason(err));
          setRemoteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, localPayload, effectiveApiUrl, route.issueId, route.secretKey]);

  // Register a secret-key-scoped remote media fetcher when viewing without an active member session
  useEffect(() => {
    const needsPublicMediaFetcher =
      Boolean(effectiveApiUrl) &&
      (!syncConfig.sessionToken ||
        (Boolean(route.apiUrl) && route.apiUrl !== syncConfig.appsScriptUrl));
    if (!needsPublicMediaFetcher || !effectiveApiUrl) return;

    registerRemoteMediaFetcher((mediaId, variant) =>
      fetchPublicMediaFromRelay(effectiveApiUrl, route.issueId, route.secretKey, mediaId, variant),
    );
    return () => {
      if (!syncConfig.sessionToken) {
        registerRemoteMediaFetcher(null);
      }
    };
  }, [
    effectiveApiUrl,
    route.apiUrl,
    route.issueId,
    route.secretKey,
    syncConfig.appsScriptUrl,
    syncConfig.sessionToken,
  ]);

  const activePayload = localPayload || remotePayload;

  if (!hydrated || (!activePayload && remoteLoading)) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#FAF8F5] dark:bg-[#0F1117] px-4">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-stone-600 dark:text-stone-300">
          <Loader2 className="w-5 h-5 animate-spin text-[#1B5E7C]" />
          <span>{tr('readerLoadingTitle')}</span>
        </div>
      </div>
    );
  }

  if (!activePayload) {
    const errorMap: Record<PublicErrorReason, { title: string; body: string }> = {
      not_found: {
        title: tr('readerErrorNotFoundTitle'),
        body: tr('readerErrorNotFoundBody'),
      },
      invalid_key: {
        title: tr('readerErrorInvalidKeyTitle'),
        body: tr('readerErrorInvalidKeyBody'),
      },
      revoked: {
        title: tr('readerErrorRevokedTitle'),
        body: tr('readerErrorRevokedBody'),
      },
      expired: {
        title: tr('readerErrorExpiredTitle'),
        body: tr('readerErrorExpiredBody'),
      },
    };

    const reason: PublicErrorReason =
      remoteError || (!localAccess.ok ? localAccess.reason : 'not_found');
    const msg = errorMap[reason];

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#FAF8F5] dark:bg-[#0F1117] px-4 py-8">
        <div className="max-w-md w-full rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 shadow-xl p-7 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/12 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="font-serif-display text-2xl font-bold text-stone-900 dark:text-stone-100">
            {msg.title}
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
            {msg.body}
          </p>
          <button
            type="button"
            onClick={onExitToApp}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-sm font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tr('readerBackToApp')}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <PrintGazetteView
      payload={activePayload}
      lang={language}
      onChangeLang={setLanguage}
      onBack={onExitToApp}
      backLabel={tr('readerBackToApp')}
      isPublicMode
      autoDownloadPdf={route.format === 'pdf'}
    />
  );
};

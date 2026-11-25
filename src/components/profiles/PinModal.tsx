import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Delete, KeyRound, Lock, ShieldCheck, Unlock } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { FamilyProfile } from '../../types/family';
import { AVATAR_THEME_MAP } from '../../utils/themes';

interface PinModalProps {
  profile: FamilyProfile;
  onCancel: () => void;
}

export const PinModal: React.FC<PinModalProps> = ({ profile, onCancel }) => {
  const { adminProfiles, verifyPendingPin, adminResetUserPin, tr } = useFamily();

  const [pin, setPin] = useState('');
  const [rememberOnDevice, setRememberOnDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [recoveryMode, setRecoveryMode] = useState(false);
  const eligibleAdmins = useMemo(
    () => adminProfiles.filter((a) => a.id !== profile.id),
    [adminProfiles, profile.id],
  );
  const [selectedAdminId, setSelectedAdminId] = useState<string>(
    () => eligibleAdmins[0]?.id || '',
  );
  const [adminPin, setAdminPin] = useState('');
  const [resetAction, setResetAction] = useState<'remove' | 'set'>('remove');
  const [newPin, setNewPin] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySaving, setRecoverySaving] = useState(false);

  useEffect(() => {
    if (!eligibleAdmins.some((a) => a.id === selectedAdminId)) {
      setSelectedAdminId(eligibleAdmins[0]?.id || '');
    }
  }, [eligibleAdmins, selectedAdminId]);

  const selectedAdmin = useMemo(
    () => eligibleAdmins.find((a) => a.id === selectedAdminId) || eligibleAdmins[0] || null,
    [eligibleAdmins, selectedAdminId],
  );

  const themeMeta = AVATAR_THEME_MAP[profile.avatarTheme] || AVATAR_THEME_MAP.teal;

  const submitPin = useCallback(
    async (candidate: string) => {
      if (candidate.length < 4 || submitting) return;
      setSubmitting(true);
      setError(null);
      const ok = await verifyPendingPin(candidate, rememberOnDevice);
      setSubmitting(false);
      if (!ok) {
        setShaking(true);
        setError(tr('pinIncorrect'));
        setPin('');
        window.setTimeout(() => setShaking(false), 380);
      }
    },
    [rememberOnDevice, submitting, tr, verifyPendingPin],
  );

  const appendDigit = useCallback(
    (digit: string) => {
      if (submitting) return;
      setError(null);
      setPin((prev) => (prev.length < 6 ? prev + digit : prev));
    },
    [submitting],
  );

  const backspace = useCallback(() => {
    if (submitting) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, [submitting]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (recoveryMode) {
        if (e.key === 'Escape') {
          setRecoveryMode(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Backspace') {
        backspace();
      } else if (e.key === 'Enter') {
        void submitPin(pin);
      } else if (/^[0-9]$/.test(e.key)) {
        appendDigit(e.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appendDigit, backspace, onCancel, pin, recoveryMode, submitPin]);

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin) return;
    setRecoveryError(null);

    if (resetAction === 'set' && !/^\d{4,6}$/.test(newPin.trim())) {
      setRecoveryError(tr('profilePinInvalid'));
      return;
    }

    setRecoverySaving(true);
    const result = await adminResetUserPin(
      selectedAdmin.id,
      selectedAdmin.pinHash ? adminPin : null,
      profile.id,
      resetAction === 'remove' ? null : newPin.trim(),
      resetAction === 'remove',
    );
    setRecoverySaving(false);

    if (!result.ok) {
      setRecoveryError(result.error || tr('pinResetError'));
      return;
    }

    if (resetAction === 'set') {
      setRecoveryMode(false);
      setPin('');
      setAdminPin('');
      setNewPin('');
      setError(null);
    }
  };

  if (typeof document === 'undefined') return null;

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return createPortal(
    <div className="fixed inset-0 h-[100dvh] z-50 flex items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(4rem,calc(env(safe-area-inset-bottom)+3rem))] sm:py-6 overflow-y-auto bg-stone-950/75 backdrop-blur-md">
      <div
        className={`w-full max-w-sm my-auto max-h-[calc(100dvh-5.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 shadow-2xl p-6 sm:p-7 animate-fade-slide ${
          shaking ? 'animate-shake' : ''
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => (recoveryMode ? setRecoveryMode(false) : onCancel())}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            {recoveryMode ? tr('pinBackToKeypad') : tr('pinBackToProfiles')}
          </button>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
            {recoveryMode ? (
              <>
                <ShieldCheck className="w-3 h-3 text-amber-600" /> {tr('pinAdminRecoveryBadge')}
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" /> {tr('pinLockedBadge')}
              </>
            )}
          </span>
        </div>

        <div className="flex flex-col items-center text-center mb-5">
          <div
            className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${themeMeta.gradient} flex items-center justify-center text-3xl shadow-lg mb-3`}
          >
            {profile.avatarEmoji}
          </div>
          <h2 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100">
            {recoveryMode
              ? tr('pinResetTitle', { name: profile.name })
              : tr('pinWelcomeBack', { name: profile.name })}
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            {recoveryMode ? tr('pinResetSubtitle') : tr('pinEnterPrompt')}
          </p>
        </div>

        {recoveryMode && selectedAdmin ? (
          <form onSubmit={(e) => void handleRecoverySubmit(e)} className="space-y-3.5">
            {eligibleAdmins.length > 1 ? (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Admin
                </label>
                <select
                  value={selectedAdmin.id}
                  onChange={(e) => {
                    setSelectedAdminId(e.target.value);
                    setAdminPin('');
                    setRecoveryError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-medium text-stone-900 dark:text-stone-100 outline-none"
                >
                  {eligibleAdmins.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.avatarEmoji} {admin.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-xs">
                <span className="text-base">{selectedAdmin.avatarEmoji}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900 dark:text-stone-100">
                    {tr('pinAuthorizingAs', { name: selectedAdmin.name })}
                  </p>
                  {!selectedAdmin.pinHash && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {tr('pinAdminPinMissingTip', { name: selectedAdmin.name })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {selectedAdmin.pinHash && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  {tr('pinAdminPinLabel', { name: selectedAdmin.name })}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={tr('pinAdminPinPlaceholder')}
                  autoFocus
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800/80">
              <button
                type="button"
                onClick={() => setResetAction('remove')}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  resetAction === 'remove'
                    ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {tr('pinRemoveAction')}
              </button>
              <button
                type="button"
                onClick={() => setResetAction('set')}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  resetAction === 'set'
                    ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {tr('pinSetAction')}
              </button>
            </div>

            {resetAction === 'set' && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  {tr('pinNewForUser', { name: profile.name })}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
                />
              </div>
            )}

            {recoveryError && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {recoveryError}
              </p>
            )}

            <button
              type="submit"
              disabled={recoverySaving}
              className="w-full py-2.5 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-sm font-semibold shadow-md shadow-teal-900/20 disabled:opacity-50 cursor-pointer"
            >
              {recoverySaving
                ? tr('pinUpdating')
                : resetAction === 'remove'
                  ? tr('pinRemoveAndOpen', { name: profile.name })
                  : tr('pinSaveNewForUser')}
            </button>
          </form>
        ) : (
          <>
            <div className="flex justify-center items-center gap-2.5 h-8 mb-2">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const filled = idx < pin.length;
                const visibleSlot = idx < 4 || idx < pin.length;
                if (!visibleSlot) return null;
                return (
                  <span
                    key={idx}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                      filled
                        ? 'bg-[#1B5E7C] dark:bg-teal-400 scale-110 shadow-sm'
                        : 'bg-stone-200 dark:bg-stone-700'
                    }`}
                  />
                );
              })}
            </div>

            <div className="h-5 text-center mb-3">
              {error && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
              {digits.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => appendDigit(d)}
                  className="h-13 rounded-2xl bg-stone-100 hover:bg-stone-200 active:scale-95 dark:bg-stone-800/80 dark:hover:bg-stone-700 text-lg font-semibold text-stone-900 dark:text-stone-100 transition-all cursor-pointer select-none"
                >
                  {d}
                </button>
              ))}

              <button
                type="button"
                onClick={backspace}
                aria-label="Backspace"
                className="h-13 rounded-2xl bg-stone-100/70 hover:bg-stone-200 active:scale-95 dark:bg-stone-800/50 dark:hover:bg-stone-700 flex items-center justify-center text-stone-600 dark:text-stone-300 transition-all cursor-pointer"
              >
                <Delete className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => appendDigit('0')}
                className="h-13 rounded-2xl bg-stone-100 hover:bg-stone-200 active:scale-95 dark:bg-stone-800/80 dark:hover:bg-stone-700 text-lg font-semibold text-stone-900 dark:text-stone-100 transition-all cursor-pointer select-none"
              >
                0
              </button>

              <button
                type="button"
                disabled={pin.length < 4 || submitting}
                onClick={() => void submitPin(pin)}
                aria-label="Unlock"
                className="h-13 rounded-2xl bg-[#1B5E7C] hover:bg-[#164b63] disabled:opacity-40 disabled:pointer-events-none active:scale-95 text-white font-semibold text-sm flex items-center justify-center gap-1 shadow-md shadow-teal-900/25 transition-all cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
              </button>
            </div>

            <label className="mt-4 flex items-start gap-2.5 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-900/70 border border-stone-200/80 dark:border-stone-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberOnDevice}
                onChange={(e) => setRememberOnDevice(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 dark:border-stone-600 text-[#1B5E7C] focus:ring-[#1B5E7C] cursor-pointer"
              />
              <span className="min-w-0 text-left">
                <span className="block text-xs font-semibold text-stone-800 dark:text-stone-200">
                  {tr('pinRememberDevice')}
                </span>
                <span className="block text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                  {tr('pinRememberDeviceHint')}
                </span>
              </span>
            </label>

            {eligibleAdmins.length > 0 && (
              <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMode(true);
                    setRecoveryError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B5E7C] dark:text-teal-400 hover:underline cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" /> {tr('pinForgotAskAdmin')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

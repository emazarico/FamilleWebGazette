import React, { useEffect, useState } from 'react';
import { Globe2, Lock, Mail, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type {
  AvatarTheme,
  FamilyProfile,
  MemberRole,
  RememberedPerson,
  UiLanguage,
} from '../../types/family';
import { isProfileAdmin } from '../../utils/admin';
import { verifyPin } from '../../utils/crypto';
import { AVATAR_EMOJIS, AVATAR_THEME_MAP, extractFirstGrapheme } from '../../utils/themes';
import { Modal } from '../common/Modal';

interface ProfileFormModalProps {
  open: boolean;
  onClose: () => void;
  editProfile?: FamilyProfile | null;
  upgradeGuest?: RememberedPerson | null;
  adminOverride?: boolean;
  autoLoginOnCreate?: boolean;
}

export const ProfileFormModal: React.FC<ProfileFormModalProps> = ({
  open,
  onClose,
  editProfile,
  upgradeGuest,
  adminOverride = false,
  autoLoginOnCreate = true,
}) => {
  const {
    createProfile,
    updateProfile,
    deleteProfile,
    upgradePersonToMember,
    isProfileSubscribedToGazette,
    activeProfiles,
    adminProfiles,
    isActiveProfileAdmin,
    language: currentUiLanguage,
    tr,
  } = useFamily();

  const [name, setName] = useState('');
  const [relationLabel, setRelationLabel] = useState('');
  const [email, setEmail] = useState('');
  const [subscribeToGazette, setSubscribeToGazette] = useState(true);
  const [primaryLang, setPrimaryLang] = useState<UiLanguage>('fr');
  const [avatarEmoji, setAvatarEmoji] = useState('🌿');
  const [customEmojiInput, setCustomEmojiInput] = useState('');
  const [avatarTheme, setAvatarTheme] = useState<AvatarTheme>('teal');
  const [role, setRole] = useState<MemberRole>('member');

  const [pinMode, setPinMode] = useState<'none' | 'keep' | 'set' | 'remove'>('none');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManageRoles =
    adminOverride || isActiveProfileAdmin || activeProfiles.length === 0;
  const isLastAdmin = Boolean(
    editProfile &&
      isProfileAdmin(editProfile, activeProfiles) &&
      adminProfiles.length <= 1,
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');

    if (editProfile) {
      setName(editProfile.name);
      setRelationLabel(editProfile.relationLabel || '');
      setEmail(editProfile.email || '');
      setSubscribeToGazette(
        editProfile.email ? isProfileSubscribedToGazette(editProfile.id) : true,
      );
      setPrimaryLang(editProfile.language === 'en' ? 'en' : 'fr');
      setAvatarEmoji(editProfile.avatarEmoji);
      setCustomEmojiInput(
        AVATAR_EMOJIS.includes(editProfile.avatarEmoji) ? '' : editProfile.avatarEmoji,
      );
      setAvatarTheme(editProfile.avatarTheme);
      setRole(isProfileAdmin(editProfile, activeProfiles) ? 'admin' : 'member');
      setPinMode(editProfile.pinHash ? 'keep' : 'none');
    } else if (upgradeGuest) {
      setName(upgradeGuest.name);
      setRelationLabel(upgradeGuest.relationLabel || '');
      setEmail('');
      setSubscribeToGazette(true);
      setPrimaryLang('fr');
      setAvatarEmoji(upgradeGuest.avatarEmoji);
      setCustomEmojiInput(
        AVATAR_EMOJIS.includes(upgradeGuest.avatarEmoji) ? '' : upgradeGuest.avatarEmoji,
      );
      setAvatarTheme(upgradeGuest.avatarTheme);
      setRole('member');
      setPinMode('none');
    } else {
      setName('');
      setRelationLabel('');
      setEmail('');
      setSubscribeToGazette(true);
      setPrimaryLang('fr');
      setAvatarEmoji(AVATAR_EMOJIS[activeProfiles.length % AVATAR_EMOJIS.length]);
      setCustomEmojiInput('');
      const themeKeys = Object.keys(AVATAR_THEME_MAP) as AvatarTheme[];
      setAvatarTheme(themeKeys[activeProfiles.length % themeKeys.length]);
      setRole(activeProfiles.length === 0 ? 'admin' : 'member');
      setPinMode('none');
    }
  }, [open, editProfile, upgradeGuest, activeProfiles, isProfileSubscribedToGazette]);

  const handleCustomEmojiChange = (value: string) => {
    const grapheme = extractFirstGrapheme(value);
    setCustomEmojiInput(grapheme);
    if (grapheme) {
      setAvatarEmoji(grapheme);
    }
  };

  const isCustomEmojiActive = !AVATAR_EMOJIS.includes(avatarEmoji) || Boolean(customEmojiInput);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(tr('profileNameRequired'));
      return;
    }

    if (editProfile?.pinHash && !adminOverride && (pinMode === 'set' || pinMode === 'remove')) {
      const ok = await verifyPin(editProfile.id, currentPin, editProfile.pinHash);
      if (!ok) {
        setError(tr('profilePinIncorrect'));
        return;
      }
    }

    if (pinMode === 'set') {
      if (!/^\d{4,6}$/.test(newPin)) {
        setError(tr('profilePinInvalid'));
        return;
      }
      if (newPin !== confirmPin) {
        setError(tr('profilePinMismatch'));
        return;
      }
    }

    setSaving(true);
    try {
      const cleanEmail = email.trim();
      if (editProfile) {
        await updateProfile(editProfile.id, {
          name: name.trim(),
          relationLabel,
          email: cleanEmail,
          subscribeToGazette: cleanEmail ? subscribeToGazette : false,
          language: primaryLang,
          avatarEmoji,
          avatarTheme,
          role: canManageRoles ? role : undefined,
          newPin: pinMode === 'set' ? newPin : pinMode === 'remove' ? null : undefined,
        });
      } else if (upgradeGuest) {
        await upgradePersonToMember(
          upgradeGuest.id,
          {
            name: name.trim(),
            relationLabel,
            email: cleanEmail,
            subscribeToGazette: cleanEmail ? subscribeToGazette : false,
            language: primaryLang,
            avatarEmoji,
            avatarTheme,
            role: canManageRoles ? role : 'member',
            pin: pinMode === 'set' ? newPin : undefined,
          },
          autoLoginOnCreate,
        );
      } else {
        await createProfile(
          {
            name: name.trim(),
            relationLabel,
            email: cleanEmail,
            subscribeToGazette: cleanEmail ? subscribeToGazette : false,
            language: primaryLang,
            avatarEmoji,
            avatarTheme,
            role: canManageRoles ? role : 'member',
            pin: pinMode === 'set' ? newPin : undefined,
          },
          autoLoginOnCreate,
        );
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editProfile) return;
    if (window.confirm(tr('profileDeleteConfirm', { name: editProfile.name }))) {
      deleteProfile(editProfile.id);
      onClose();
    }
  };

  const themePreview = AVATAR_THEME_MAP[avatarTheme] || AVATAR_THEME_MAP.teal;
  const modalTitle = editProfile
    ? tr('profileEditTitle', { name: editProfile.name })
    : upgradeGuest
      ? tr('profileUpgradeTitle', { name: upgradeGuest.name })
      : tr('profileCreateTitle');
  const modalSubtitle = upgradeGuest ? tr('profileUpgradeSubtitle') : tr('profileModalSubtitle');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      maxWidthClass="max-w-md"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-5">
        {/* Live Preview */}
        <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800">
          <div
            className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${themePreview.gradient} flex items-center justify-center text-2xl shadow-md shrink-0`}
          >
            {avatarEmoji}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-serif-display font-bold text-lg text-stone-900 dark:text-stone-100 truncate">
                {name.trim() || tr('profileCreateTitle')}
              </p>
              {role === 'admin' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300">
                  <ShieldCheck className="w-3 h-3" /> {tr('roleAdmin')}
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                {primaryLang}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {pinMode === 'set' || pinMode === 'keep' ? tr('pinProtected') : tr('pinQuickTap')}
            </p>
          </div>
        </div>

        {/* Name & Relation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              {tr('profileNameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('profileNamePlaceholder')}
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#1B5E7C] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              {tr('profileRelationLabel')}
            </label>
            <input
              type="text"
              value={relationLabel}
              onChange={(e) => setRelationLabel(e.target.value)}
              placeholder={tr('profileRelationPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#1B5E7C] outline-none"
            />
          </div>
        </div>

        {/* Optional Email + Gazette Subscriber Opt-In */}
        <div className="space-y-2.5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              {tr('profileEmailLabel')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr('profileEmailPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-[#1B5E7C] outline-none"
            />
          </div>

          {email.trim().length > 0 && (
            <label className="flex items-start justify-between gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 cursor-pointer">
              <div className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-[#1B5E7C] dark:text-teal-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                    {tr('profileSubscribeGazetteLabel')}
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    {tr('profileSubscribeGazetteHint')}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={subscribeToGazette}
                onChange={(e) => setSubscribeToGazette(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-[#1B5E7C] cursor-pointer"
              />
            </label>
          )}
        </div>

        {/* Primary UI Language (French default) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5 text-[#1B5E7C] dark:text-teal-400" />
            {tr('languageLabel')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPrimaryLang('fr')}
              className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                primaryLang === 'fr'
                  ? 'bg-[#1B5E7C]/10 border-[#1B5E7C] text-stone-900 dark:text-stone-100'
                  : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
              }`}
            >
              <p className="text-xs font-bold">🇫🇷 {tr('languageFrench')}</p>
            </button>
            <button
              type="button"
              onClick={() => setPrimaryLang('en')}
              className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                primaryLang === 'en'
                  ? 'bg-[#1B5E7C]/10 border-[#1B5E7C] text-stone-900 dark:text-stone-100'
                  : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
              }`}
            >
              <p className="text-xs font-bold">🇬🇧 {tr('languageEnglish')}</p>
            </button>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
            {tr('languageHint')}
          </p>
        </div>

        {/* Family Role */}
        {canManageRoles && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              {tr('profileRoleLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  role === 'admin'
                    ? 'bg-amber-500/12 border-amber-500 text-stone-900 dark:text-stone-100'
                    : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                }`}
              >
                <p className="text-xs font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> {tr('profileRoleAdminTitle')}
                </p>
                <p className="text-[11px] opacity-75 mt-0.5">{tr('profileRoleAdminDesc')}</p>
              </button>

              <button
                type="button"
                disabled={isLastAdmin}
                onClick={() => setRole('member')}
                title={isLastAdmin ? tr('profileLastAdminHint') : undefined}
                className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  role === 'member'
                    ? 'bg-[#1B5E7C]/10 border-[#1B5E7C] text-stone-900 dark:text-stone-100'
                    : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                }`}
              >
                <p className="text-xs font-bold">{tr('profileRoleMemberTitle')}</p>
                <p className="text-[11px] opacity-75 mt-0.5">{tr('profileRoleMemberDesc')}</p>
              </button>
            </div>
          </div>
        )}

        {/* Emoji Avatar + Last Option: Custom Emoji */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            {tr('profileAvatarEmoji')}
          </label>
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setAvatarEmoji(emoji);
                  setCustomEmojiInput('');
                }}
                className={`h-11 rounded-xl text-lg flex items-center justify-center transition-all cursor-pointer ${
                  avatarEmoji === emoji && !isCustomEmojiActive
                    ? 'bg-[#1B5E7C]/15 ring-2 ring-[#1B5E7C] scale-105'
                    : 'bg-stone-100 dark:bg-stone-800/80 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                {emoji}
              </button>
            ))}

            {/* Last Option: Custom Emoji Picker */}
            <label
              className={`col-span-6 sm:col-span-6 flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-all cursor-text ${
                isCustomEmojiActive
                  ? 'bg-[#1B5E7C]/10 border-[#1B5E7C] ring-1 ring-[#1B5E7C]'
                  : 'bg-stone-50 dark:bg-stone-900/70 border-stone-200 dark:border-stone-700'
              }`}
            >
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                {tr('profileAvatarCustomLabel')}
              </span>
              <input
                type="text"
                value={customEmojiInput}
                onChange={(e) => handleCustomEmojiChange(e.target.value)}
                placeholder={tr('profileAvatarCustomPlaceholder')}
                aria-label={tr('profileAvatarCustomLabel')}
                className="w-24 text-center px-2 py-1 rounded-lg bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-base outline-none focus:ring-2 focus:ring-[#1B5E7C]"
              />
            </label>
          </div>
        </div>

        {/* Gradient Swatches */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
            {tr('profileAvatarTheme')}
          </label>
          <div className="flex flex-wrap gap-2.5">
            {(Object.keys(AVATAR_THEME_MAP) as AvatarTheme[]).map((key) => {
              const item = AVATAR_THEME_MAP[key];
              return (
                <button
                  key={key}
                  type="button"
                  title={currentUiLanguage === 'fr' ? item.labelFr : item.labelEn}
                  onClick={() => setAvatarTheme(key)}
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${item.gradient} transition-transform cursor-pointer ${
                    avatarTheme === key
                      ? 'ring-2 ring-offset-2 ring-stone-900 dark:ring-white dark:ring-offset-[#171A23] scale-110'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Optional PIN Settings */}
        <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                {tr('profilePinSection')}
              </span>
            </div>

            {!editProfile?.pinHash ? (
              <button
                type="button"
                onClick={() => setPinMode((m) => (m === 'set' ? 'none' : 'set'))}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  pinMode === 'set'
                    ? 'bg-[#1B5E7C] text-white'
                    : 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                {pinMode === 'set' ? tr('profilePinEnabled') : tr('profilePinAdd')}
              </button>
            ) : (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPinMode((m) => (m === 'set' ? 'keep' : 'set'))}
                  className={`text-xs font-semibold px-2 py-1 rounded-lg cursor-pointer ${
                    pinMode === 'set'
                      ? 'bg-[#1B5E7C] text-white'
                      : 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {tr('profilePinChange')}
                </button>
                <button
                  type="button"
                  onClick={() => setPinMode((m) => (m === 'remove' ? 'keep' : 'remove'))}
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg cursor-pointer ${
                    pinMode === 'remove'
                      ? 'bg-rose-600 text-white'
                      : 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <ShieldOff className="w-3 h-3" /> {tr('profilePinRemove')}
                </button>
              </div>
            )}
          </div>

          {editProfile?.pinHash && !adminOverride && (pinMode === 'set' || pinMode === 'remove') && (
            <div>
              <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1">
                {tr('profilePinVerifyCurrent')}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                placeholder={tr('profilePinCurrentPlaceholder')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
              />
            </div>
          )}

          {pinMode === 'set' && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1">
                  {tr('profilePinNew')}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1">
                  {tr('profilePinConfirm')}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="flex items-center justify-between pt-2 gap-3">
          {editProfile && !isLastAdmin ? (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> {tr('profileDelete')}
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              {tr('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#1B5E7C] hover:bg-[#164b63] text-white shadow-md shadow-teal-900/20 disabled:opacity-50 cursor-pointer"
            >
              {saving
                ? tr('saving')
                : editProfile
                  ? tr('save')
                  : tr('createAndOpen')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

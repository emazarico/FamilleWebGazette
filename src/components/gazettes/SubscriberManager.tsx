import React, { useMemo, useState } from 'react';
import { Mail, Plus, Trash2, UserCheck, Users } from 'lucide-react';
import { useFamily } from '../../store/FamilyContext';
import type { GazetteDeliveryMode, UiLanguage } from '../../types/family';

export const SubscriberManager: React.FC = () => {
  const {
    db,
    isActiveProfileAdmin,
    upsertSubscriber,
    toggleSubscriberActive,
    deleteSubscriber,
    language,
    tr,
  } = useFamily();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subLang, setSubLang] = useState<UiLanguage>(language);
  const [deliveryMode, setDeliveryMode] = useState<GazetteDeliveryMode>('digest_and_links');
  const [error, setError] = useState<string | null>(null);

  const visibleSubscribers = useMemo(
    () =>
      db.subscribers
        .filter((s) => !s.deletedAt)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db.subscribers],
  );

  const activeCount = useMemo(
    () => visibleSubscribers.filter((s) => s.active).length,
    [visibleSubscribers],
  );

  const handleAddExternal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError(tr('subscribersInvalidEmail'));
      return;
    }
    setError(null);
    upsertSubscriber({
      name: cleanName,
      email: cleanEmail,
      language: subLang,
      cadence: 'monthly',
      deliveryMode,
      active: true,
    });
    setName('');
    setEmail('');
  };

  return (
    <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 p-5 sm:p-6 space-y-4 shadow-xs">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-serif-display text-lg font-bold flex items-center gap-2 text-stone-900 dark:text-stone-100">
            <Mail className="w-5 h-5 text-[#1B5E7C] dark:text-teal-400" />
            <span>{tr('subscribersTitle', { count: activeCount })}</span>
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            {tr('subscribersDesc')}
          </p>
        </div>
      </div>

      {visibleSubscribers.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400 italic">
          {tr('subscribersEmpty')}
        </p>
      ) : (
        <div className="space-y-2.5">
          {visibleSubscribers.map((sub) => (
            <div
              key={sub.id}
              className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                    {sub.name}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      sub.profileId
                        ? 'bg-[#1B5E7C]/12 text-[#1B5E7C] dark:bg-teal-500/15 dark:text-teal-300'
                        : 'bg-stone-200/80 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                    }`}
                  >
                    {sub.profileId ? (
                      <UserCheck className="w-3 h-3" />
                    ) : (
                      <Users className="w-3 h-3" />
                    )}
                    {sub.profileId ? tr('subscribersLinkedMember') : tr('subscribersExternalContact')}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      sub.active
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                    }`}
                  >
                    {sub.active ? tr('subscribersActiveBadge') : tr('subscribersPausedBadge')}
                  </span>
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                  {sub.email}
                </p>
              </div>

              {isActiveProfileAdmin && (
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      upsertSubscriber({
                        id: sub.id,
                        name: sub.name,
                        email: sub.email,
                        language: sub.language === 'fr' ? 'en' : 'fr',
                        deliveryMode: sub.deliveryMode,
                        active: sub.active,
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[11px] font-bold uppercase text-stone-700 dark:text-stone-200 cursor-pointer"
                  >
                    {sub.language}
                  </button>

                  <select
                    value={sub.deliveryMode}
                    aria-label={sub.name}
                    onChange={(e) =>
                      upsertSubscriber({
                        id: sub.id,
                        name: sub.name,
                        email: sub.email,
                        language: sub.language,
                        deliveryMode: e.target.value as GazetteDeliveryMode,
                        active: sub.active,
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-700 dark:text-stone-200 outline-none"
                  >
                    <option value="digest_and_links">{tr('subscribersDeliveryDigestLinks')}</option>
                    <option value="digest_and_pdf_attachment">
                      {tr('subscribersDeliveryDigestPdf')}
                    </option>
                    <option value="links_only">{tr('subscribersDeliveryLinksOnly')}</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => toggleSubscriberActive(sub.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      sub.active
                        ? 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600/20'
                        : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-700'
                    }`}
                  >
                    {sub.active ? tr('subscribersActiveBadge') : tr('subscribersPausedBadge')}
                  </button>

                  {!sub.profileId && (
                    <button
                      type="button"
                      onClick={() => deleteSubscriber(sub.id)}
                      aria-label={tr('postDelete')}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isActiveProfileAdmin && (
        <form
          onSubmit={handleAddExternal}
          className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-2.5"
        >
          <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
            {tr('subscribersAddTitle')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('subscribersNamePlaceholder')}
              className="sm:col-span-3 px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr('subscribersEmailPlaceholder')}
              className="sm:col-span-4 px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm outline-none focus:ring-2 focus:ring-[#1B5E7C]"
            />
            <select
              value={subLang}
              onChange={(e) => setSubLang(e.target.value as UiLanguage)}
              className="sm:col-span-2 px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-semibold outline-none"
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
            <select
              value={deliveryMode}
              onChange={(e) => setDeliveryMode(e.target.value as GazetteDeliveryMode)}
              className="sm:col-span-3 px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs outline-none"
            >
              <option value="digest_and_links">{tr('subscribersDeliveryDigestLinks')}</option>
              <option value="digest_and_pdf_attachment">
                {tr('subscribersDeliveryDigestPdf')}
              </option>
              <option value="links_only">{tr('subscribersDeliveryLinksOnly')}</option>
            </select>
          </div>
          {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1B5E7C] hover:bg-[#164b63] text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tr('subscribersAddBtn')}</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

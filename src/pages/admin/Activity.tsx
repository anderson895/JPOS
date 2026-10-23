import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { History, Loader2, Lock } from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import { BUSINESS_UP, hasFeature } from '@/lib/entitlements';
import { activityPage, describe, type ActivityEntry } from '@/lib/activity';

/**
 * Admin → Activity (Business and up): the audit trail. Who did what, and when:
 * products and prices, stock, voids, discounts, people, settings, sign-ins.
 */
export default function Activity() {
  const { tenant, isSuperAdmin } = useAuth();
  const on = hasFeature(tenant, 'auditTrail');
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [last, setLast] = useState<QueryDocumentSnapshot | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [person, setPerson] = useState('');

  useEffect(() => {
    if (!on) { setLoading(false); return; }
    let live = true;
    activityPage()
      .then(r => { if (!live) return; setEntries(r.entries); setLast(r.last); setMore(r.more); })
      .catch(err => { console.error('[Activity]', err); if (live) setFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [on]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const r = await activityPage(last);
      setEntries(prev => [...prev, ...r.entries]); setLast(r.last); setMore(r.more);
    } catch { setFailed(true); } finally { setLoadingMore(false); }
  }

  // People in what's loaded, for the filter
  const people = useMemo(() => [...new Map(entries.map(e => [e.by, e.byName])).entries()], [entries]);
  const shown = person ? entries.filter(e => e.by === person) : entries;

  const header = <PageHeader eyebrow="Who did what" title="Activity" subtitle="Changes in your store, newest first." />;

  if (!on) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1100px] mx-auto">
        {header}
        <div className="card p-8 text-center max-w-lg mx-auto">
          <Lock className="w-8 h-8 mx-auto text-caramel-600" aria-hidden="true" />
          <p className="mt-3 text-sm text-espresso-800">The activity list: {BUSINESS_UP.charAt(0).toLowerCase() + BUSINESS_UP.slice(1)}</p>
          {!isSuperAdmin && <Link to="/admin/billing" className="btn-primary mt-5 inline-flex">See packages</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1100px] mx-auto animate-fade-in">
      {header}
      {people.length > 1 && (
        <div className="card p-3 flex items-center gap-3">
          <label htmlFor="activity-person" className="text-sm font-medium text-espresso-800 pl-2">Person</label>
          <select id="activity-person" className="input sm:max-w-xs" value={person} onChange={e => setPerson(e.target.value)}>
            <option value="">Everyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      )}

      <div className="card p-2 sm:p-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-caramel-600" aria-label="Loading" /></div>
        ) : failed && entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-bark-500">Couldn't load the activity. Try again in a moment.</p>
        ) : shown.length === 0 ? (
          <div className="py-12 text-center text-bark-500">
            <History className="w-9 h-9 mx-auto text-caramel-500/60" aria-hidden="true" />
            <p className="mt-2 text-sm">Nothing yet. Changes in your store show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-cream-300/70">
            {shown.map(e => (
              <li key={e.id} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-start sm:gap-4">
                <span className="w-36 shrink-0 text-xs text-bark-500 sm:pt-0.5">
                  {e.at ? format(e.at.toDate(), 'MMM d, h:mm a') : 'Just now'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-espresso-900"><span className="font-semibold">{e.byName}</span> · {describe(e)}</p>
                  {e.note && <p className="mt-0.5 text-xs text-bark-600 break-words">{e.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {more && (
          <div className="flex justify-center p-3">
            <button onClick={loadMore} disabled={loadingMore} className="btn-secondary px-5 py-2 text-sm">
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Show more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

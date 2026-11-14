import React, { useEffect, useState } from 'react';

/** Read once: the event the user came from ("Add announcement" on an event). */
export function takeEventFor(): string {
  try { const v = sessionStorage.getItem('cm_event_for') || ''; sessionStorage.removeItem('cm_event_for'); return v; } catch { return ''; }
}

const cache: Record<string, { at: number; list: any[] }> = {};
export function useEvents(communityId: string) {
  const [list, setList] = useState<any[]>(cache[communityId]?.list || []);
  useEffect(() => {
    if (cache[communityId] && Date.now() - cache[communityId].at < 30_000) return;
    fetch('/api/v1/events', { credentials: 'include', headers: { 'x-community-id': communityId } }).then((r) => r.json())
      .then((j) => { const l = j.events || []; cache[communityId] = { at: Date.now(), list: l }; setList(l); }).catch(() => undefined);
  }, [communityId]);
  return list;
}

/** "Part of an event" picker used in announcements, campaigns, reminders, polls and giveaways. */
export function EventPick({ communityId, value, onChange }: { communityId: string; value: string; onChange: (v: string) => void }) {
  const events = useEvents(communityId).filter((e) => ['DRAFT', 'SCHEDULED', 'LIVE'].includes(e.status) || e.id === value);
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Part of an event <span className="font-normal normal-case text-slate-400">(optional)</span>
      <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-900" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not part of an event</option>
        {events.map((e) => <option key={e.id} value={e.id}>📅 {e.title} · {new Date(e.startAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</option>)}
      </select>
    </label>
  );
}

/** After creating something: attach it to the chosen event. Returns the API result unchanged. */
export async function attachToEvent(communityId: string, eventId: string, type: string, result: any) {
  const id = result?.announcement?.id || result?.campaign?.id || result?.reminder?.id || result?.poll?.id || result?.data?.id || result?.id;
  if (eventId && id) {
    await fetch(`/api/v1/events/${eventId}/attach`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-community-id': communityId }, body: JSON.stringify({ type, id }) }).catch(() => undefined);
    delete cache[communityId];
  }
  return result;
}

/** Small tag on list items that belong to an event. */
export function EventTag({ item }: { item: any }) {
  return item?.eventTitle ? <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">📅 {item.eventTitle}</span> : null;
}

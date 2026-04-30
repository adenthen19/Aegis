'use client';

import { useTransition } from 'react';
import { setEventStatusAction } from '../actions';
import { EVENT_STATUS_LABEL, type EventStatus } from '@/lib/types';

const STATUSES: EventStatus[] = ['planned', 'ongoing', 'completed', 'cancelled'];

export default function EventStatusSelect({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  const [pending, startTransition] = useTransition();

  function onChange(next: EventStatus) {
    if (next === status) return;
    startTransition(async () => {
      await setEventStatusAction(eventId, next);
    });
  }

  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as EventStatus)}
      disabled={pending}
      className="rounded-md border border-aegis-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-aegis-navy outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10 disabled:opacity-60"
      aria-label="Change event status"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {EVENT_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

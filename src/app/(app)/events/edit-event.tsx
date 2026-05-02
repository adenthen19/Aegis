'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import EventFormFields from './event-form-fields';
import { updateEventAction, type ActionState } from './actions';
import type { EventRow } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

type ClientOption = { client_id: string; corporate_name: string };

export default function EditEvent({
  row,
  clients,
  open,
  onClose,
}: {
  row: EventRow;
  clients: ClientOption[];
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState(updateEventAction, initial);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit event"
      description="Update the date, location, status, or guest-list owner."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="event_id" value={row.event_id} />
        <EventFormFields initial={row} clients={clients} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} submitLabel="Update" />
      </form>
    </Modal>
  );
}

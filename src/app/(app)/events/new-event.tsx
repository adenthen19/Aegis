'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import { AddButton, FormActions, FormError } from '@/components/ui/form';
import EventFormFields from './event-form-fields';
import { createEventAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

type ClientOption = { client_id: string; corporate_name: string };

export default function NewEvent({ clients }: { clients: ClientOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createEventAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label="New event" />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New event"
        description="Plan an AGM, briefing, launch — anything with a guest list."
      >
        <form action={action} className="space-y-4">
          <EventFormFields clients={clients} />
          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

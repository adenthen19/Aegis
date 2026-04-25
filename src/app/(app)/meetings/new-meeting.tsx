'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import { AddButton, FormActions, FormError } from '@/components/ui/form';
import MeetingFormFields from './meeting-form-fields';
import { createMeetingAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

export default function NewMeeting({
  clients, analysts,
}: {
  clients: { client_id: string; corporate_name: string }[];
  analysts: { investor_id: string; institution_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createMeetingAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label="Log meeting" />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log a meeting"
        description="Record an engagement with a client, an investor, or both."
      >
        <form action={action} className="space-y-4">
          <MeetingFormFields clients={clients} analysts={analysts} />
          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

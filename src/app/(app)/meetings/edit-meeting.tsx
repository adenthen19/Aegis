'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import MeetingFormFields from './meeting-form-fields';
import { updateMeetingAction, type ActionState } from './actions';
import type { Meeting } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

export default function EditMeeting({
  row, open, onClose, clients, analysts,
}: {
  row: Meeting;
  open: boolean;
  onClose: () => void;
  clients: { client_id: string; corporate_name: string }[];
  analysts: { investor_id: string; institution_name: string }[];
}) {
  const [state, action] = useActionState(updateMeetingAction, initial);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit meeting"
      description={new Date(row.meeting_date).toLocaleString()}
    >
      <form action={action} className="space-y-4">
        <MeetingFormFields initial={row} clients={clients} analysts={analysts} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

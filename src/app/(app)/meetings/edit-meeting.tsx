'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import MeetingFormFields from './meeting-form-fields';
import { updateMeetingAction, type ActionState } from './actions';
import type { ActionItem, Meeting, Profile } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

export default function EditMeeting({
  row,
  attendeeUserIds,
  actionItems,
  open,
  onClose,
  clients,
  analysts,
  profiles,
}: {
  row: Meeting;
  attendeeUserIds: string[];
  actionItems: ActionItem[];
  open: boolean;
  onClose: () => void;
  clients: { client_id: string; corporate_name: string }[];
  analysts: { investor_id: string; institution_name: string }[];
  profiles: Profile[];
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
      size="2xl"
    >
      <form action={action} className="space-y-4">
        <MeetingFormFields
          initial={row}
          initialAttendeeIds={attendeeUserIds}
          initialActionItems={actionItems}
          clients={clients}
          analysts={analysts}
          profiles={profiles}
        />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} submitLabel="Update" />
      </form>
    </Modal>
  );
}

'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import {
  AddButton,
  DateTimeField,
  FormActions,
  FormError,
  SelectField,
  TextField,
} from '@/components/ui/form';
import type { Profile } from '@/lib/types';
import { createTodoAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

export default function NewTodo({
  clients,
  profiles,
  currentUserId,
  defaultClientId,
  triggerLabel = 'New to-do',
}: {
  clients: { client_id: string; corporate_name: string }[];
  profiles: Profile[];
  currentUserId: string;
  defaultClientId?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createTodoAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const profileLabel = (p: Profile) => p.display_name || p.email;
  const sortedProfiles = [...profiles].sort((a, b) =>
    profileLabel(a).localeCompare(profileLabel(b)),
  );

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label={triggerLabel} />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New to-do"
        description="Add an action item — optionally linked to a client."
      >
        <form action={action} className="space-y-4">
          <TextField
            name="item"
            label="To-do"
            required
            placeholder="What needs to be done"
          />

          <SelectField
            name="pic_user_id"
            label="Assignee (PIC)"
            defaultValue={currentUserId}
            options={sortedProfiles.map((p) => ({
              value: p.user_id,
              label: profileLabel(p),
            }))}
            hint="Defaults to you."
          />

          <DateTimeField
            name="due_date"
            label="Due date"
            type="date"
          />

          <SelectField
            name="client_id"
            label="Link to client"
            clearable
            defaultValue={defaultClientId ?? ''}
            options={clients.map((c) => ({
              value: c.client_id,
              label: c.corporate_name,
            }))}
            hint="Optional — pending to-dos appear on the client profile."
          />

          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

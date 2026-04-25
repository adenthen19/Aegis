'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import { AddButton, FormActions, FormError } from '@/components/ui/form';
import ProjectFormFields from './project-form-fields';
import { createProjectAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

export default function NewProject({
  clients,
}: {
  clients: { client_id: string; corporate_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createProjectAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label="New project" />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New project"
        description="Track a new client deliverable."
      >
        <form action={action} className="space-y-4">
          <ProjectFormFields clients={clients} />
          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

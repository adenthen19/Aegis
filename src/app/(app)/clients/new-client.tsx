'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import { AddButton, FormActions, FormError } from '@/components/ui/form';
import ClientFormFields from './client-form-fields';
import { createClientAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

export default function NewClient() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createClientAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label="New client" />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New client"
        description="Add a corporate client engagement to the roster."
      >
        <form action={action} className="space-y-4">
          <ClientFormFields />
          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

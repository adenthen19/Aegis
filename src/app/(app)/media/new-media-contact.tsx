'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import { AddButton, FormActions, FormError } from '@/components/ui/form';
import MediaFormFields from './media-form-fields';
import { createMediaContactAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

export default function NewMediaContact() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createMediaContactAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label="New media contact" />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New media contact"
        description="Add a journalist or media stakeholder."
      >
        <form action={action} className="space-y-4">
          <MediaFormFields />
          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

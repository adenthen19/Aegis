'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import { AddButton, FormActions, FormError } from '@/components/ui/form';
import AnalystFormFields from './analyst-form-fields';
import { createAnalystAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

export default function NewAnalyst() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createAnalystAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label="New analyst" />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New analyst or fund manager"
        description="Add an investor coverage relationship."
      >
        <form action={action} className="space-y-4">
          <AnalystFormFields />
          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

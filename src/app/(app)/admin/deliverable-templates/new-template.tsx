'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import { AddButton, FormActions, FormError } from '@/components/ui/form';
import TemplateFormFields from './template-form-fields';
import { createDeliverableTemplateAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

export default function NewTemplate() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createDeliverableTemplateAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label="New template" />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New deliverable template"
        description="Standard commitment seeded into clients on this service tier."
      >
        <form action={action} className="space-y-4">
          <TemplateFormFields />
          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

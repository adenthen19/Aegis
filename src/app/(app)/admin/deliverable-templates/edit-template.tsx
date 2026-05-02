'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import TemplateFormFields from './template-form-fields';
import { updateDeliverableTemplateAction, type ActionState } from './actions';
import type { DeliverableTemplate } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

export default function EditTemplate({
  row,
  open,
  onClose,
}: {
  row: DeliverableTemplate;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState(updateDeliverableTemplateAction, initial);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit template"
      description="Existing client deliverables keep their snapshot — only future seeding picks up the new label."
    >
      <form action={action} className="space-y-4">
        <TemplateFormFields initial={row} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} submitLabel="Update" />
      </form>
    </Modal>
  );
}

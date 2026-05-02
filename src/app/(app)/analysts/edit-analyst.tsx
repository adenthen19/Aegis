'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import AnalystFormFields from './analyst-form-fields';
import { updateAnalystAction, type ActionState } from './actions';
import type { Analyst } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

export default function EditAnalyst({
  row, open, onClose,
}: {
  row: Analyst;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState(updateAnalystAction, initial);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit analyst" description={row.institution_name}>
      <form action={action} className="space-y-4">
        <AnalystFormFields initial={row} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} submitLabel="Update" />
      </form>
    </Modal>
  );
}

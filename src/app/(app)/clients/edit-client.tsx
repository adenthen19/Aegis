'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import ClientFormFields from './client-form-fields';
import { updateClientAction, type ActionState } from './actions';
import type { Client } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

export default function EditClient({
  row, open, onClose,
}: {
  row: Client;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState(updateClientAction, initial);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit client"
      description={row.corporate_name}
    >
      <form action={action} className="space-y-4">
        <ClientFormFields initial={row} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} submitLabel="Update" />
      </form>
    </Modal>
  );
}

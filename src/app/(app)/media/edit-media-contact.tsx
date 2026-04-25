'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import MediaFormFields from './media-form-fields';
import { updateMediaContactAction, type ActionState } from './actions';
import type { MediaContact } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

export default function EditMediaContact({
  row, open, onClose,
}: {
  row: MediaContact;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState(updateMediaContactAction, initial);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit media contact" description={row.full_name}>
      <form action={action} className="space-y-4">
        <MediaFormFields initial={row} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import UserFormFields from './user-form-fields';
import { updateUserAction, type ActionState } from './actions';
import type { Profile } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

export default function EditUser({
  row,
  open,
  onClose,
  isSelf,
}: {
  row: Profile;
  open: boolean;
  onClose: () => void;
  isSelf: boolean;
}) {
  const [state, action] = useActionState(updateUserAction, initial);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit user"
      description={row.email}
      size="2xl"
    >
      <form action={action} className="space-y-4">
        <UserFormFields initial={row} isEdit isSelf={isSelf} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

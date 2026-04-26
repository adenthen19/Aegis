'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import { AddButton, FormActions, FormError } from '@/components/ui/form';
import UserFormFields from './user-form-fields';
import { createUserAction, type ActionState } from './actions';

const initial: ActionState = { ok: false, error: null };

export default function NewUser() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createUserAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <AddButton onClick={() => setOpen(true)} label="Add user" />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add user"
        description="Create a new staff account. They sign in with their username or email."
        size="2xl"
      >
        <form action={action} className="space-y-4">
          <UserFormFields isEdit={false} />
          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

'use client';

import { useActionState, useEffect } from 'react';
import Modal from '@/components/ui/modal';
import { FormActions, FormError } from '@/components/ui/form';
import ProjectFormFields from './project-form-fields';
import { updateProjectAction, type ActionState } from './actions';
import type { Project } from '@/lib/types';

const initial: ActionState = { ok: false, error: null };

export default function EditProject({
  row, open, onClose, clients,
}: {
  row: Project;
  open: boolean;
  onClose: () => void;
  clients: { client_id: string; corporate_name: string }[];
}) {
  const [state, action] = useActionState(updateProjectAction, initial);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit project" description={row.deliverable_name}>
      <form action={action} className="space-y-4">
        <ProjectFormFields initial={row} clients={clients} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} submitLabel="Update" />
      </form>
    </Modal>
  );
}

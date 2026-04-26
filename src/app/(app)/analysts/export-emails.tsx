'use client';

import ExportEmailsButton from '@/components/ui/export-emails-button';
import { exportAnalystEmailsAction } from './actions';

export default function ExportAnalystEmails() {
  return (
    <ExportEmailsButton
      action={exportAnalystEmailsAction}
      label="Export emails"
      modalTitle="Export analyst emails for BCC"
    />
  );
}

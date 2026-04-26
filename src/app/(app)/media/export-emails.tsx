'use client';

import ExportEmailsButton from '@/components/ui/export-emails-button';
import { exportMediaEmailsAction } from './actions';

export default function ExportMediaEmails() {
  return (
    <ExportEmailsButton
      action={exportMediaEmailsAction}
      label="Export emails"
      modalTitle="Export media emails for BCC"
    />
  );
}

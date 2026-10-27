import { t } from '@grafana/i18n';
import { usePluginComponent } from '@grafana/runtime';
import { Modal } from '@grafana/ui';
import React from 'react';

import {
  ADD_TO_NOTEBOOK_COMPONENT_ID,
  type AddToNotebookFormProps,
  canAddToNotebook,
  type NotebookCapture,
} from './addToNotebook';

export function useNotebookForm() {
  const { component, isLoading } = usePluginComponent<AddToNotebookFormProps>(ADD_TO_NOTEBOOK_COMPONENT_ID);
  return !isLoading && canAddToNotebook() ? component : null;
}

export function AddToNotebookModal({ capture, onClose }: { capture: NotebookCapture; onClose: () => void }) {
  const Form = useNotebookForm();
  if (!Form) {
    return null;
  }
  return (
    <Modal title={t('notebook.context.add', 'Add query context to notebook')} isOpen onDismiss={onClose}>
      {React.createElement(Form, { ...capture, onClose, onAdded: onClose })}
    </Modal>
  );
}

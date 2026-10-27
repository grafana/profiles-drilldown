import { config, usePluginComponent } from '@grafana/runtime';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { ADD_TO_NOTEBOOK_COMPONENT_ID, type AddToNotebookFormProps, type NotebookCapture } from './addToNotebook';
import { AddToNotebookModal } from './AddToNotebookModal';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  usePluginComponent: jest.fn(),
}));
jest.mock('@grafana/ui', () => ({
  ...jest.requireActual('@grafana/ui'),
  Modal: ({ children, onDismiss }: React.PropsWithChildren<{ onDismiss: () => void }>) => (
    <div>
      <button onClick={onDismiss}>Dismiss</button>
      {children}
    </div>
  ),
}));

const capture: NotebookCapture = {
  cells: [{ kind: 'markdown', text: 'Context only: selected query and window' }],
  defaultTitle: 'Profiles Drilldown query context',
};

describe('AddToNotebookModal', () => {
  const originalPermissions = config.bootData.user.permissions;
  beforeEach(() => {
    config.bootData.user.permissions = { 'notebooks:write': true };
  });
  afterEach(() => {
    config.bootData.user.permissions = originalPermissions;
  });

  it.each([
    [true, true, true],
    [false, false, true],
    [false, true, false],
  ])('hides for loading=%s, present=%s, permission=%s', (isLoading, present, permission) => {
    config.bootData.user.permissions = permission ? { 'notebooks:create': true } : {};
    jest.mocked(usePluginComponent).mockReturnValue({ isLoading, component: present ? () => <div>Form</div> : null });
    const { container } = render(<AddToNotebookModal capture={capture} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('passes only the v2 markdown shape/title and closes on dismiss, cancel, or successful addition', () => {
    let formProps: AddToNotebookFormProps | undefined;
    const Form = (props: AddToNotebookFormProps) => {
      formProps = props;
      return <button onClick={props.onClose}>Cancel</button>;
    };
    jest.mocked(usePluginComponent<AddToNotebookFormProps>).mockReturnValue({ isLoading: false, component: Form });
    const onClose = jest.fn();
    render(<AddToNotebookModal capture={capture} onClose={onClose} />);
    expect(usePluginComponent).toHaveBeenCalledWith(ADD_TO_NOTEBOOK_COMPONENT_ID);
    expect(formProps?.cells).toEqual(capture.cells);
    expect(formProps?.defaultTitle).toBe(capture.defaultTitle);
    expect(formProps).not.toHaveProperty('buildPanel');
    expect(formProps).not.toHaveProperty('capturedTimeRange');
    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Dismiss'));
    formProps?.onAdded?.({ uid: 'notebook-uid', title: 'Notebook', url: '/notebooks/notebook-uid' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

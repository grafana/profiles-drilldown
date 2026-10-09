import { AdHocFiltersVariable, EmbeddedScene, SceneVariableSet } from '@grafana/scenes';
import { Combobox } from '@grafana/ui';
import { LabelsRepository } from '@shared/infrastructure/labels/labelsRepository';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { act, ComponentProps } from 'react';

import { SceneQuickFilter } from '../SceneByVariableRepeaterGrid/components/SceneQuickFilter';
import { AllServicesCombobox } from './AllServicesCombobox';

type ComboProps = ComponentProps<typeof Combobox<string>>;
let comboProps: ComboProps;
jest.mock('@grafana/ui', () => ({
  ...jest.requireActual('@grafana/ui'),
  Combobox: (props: ComboProps) => {
    comboProps = props;
    return <input type="text" aria-label="Combined filter" />;
  },
}));

function setup(searchText = '') {
  const model = new AdHocFiltersVariable({ name: 'filtersAllServices', filters: [] });
  const quickFilter = new SceneQuickFilter({ placeholder: '' });
  quickFilter.setState({ searchText });
  const scene = new EmbeddedScene({ $variables: new SceneVariableSet({ variables: [model] }), body: quickFilter });
  render(<AllServicesCombobox model={model} dataSourceUid="pyroscope" query="cpu{}" from={1000} to={2000} />);
  return { model, quickFilter, scene };
}

async function enter(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Combined filter' }), { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Combined filter' }), { key: 'Enter' });
  });
}

beforeEach(() => {
  jest.spyOn(window, 'IntersectionObserver').mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
    takeRecords: jest.fn(() => []),
    root: null,
    rootMargin: '',
    thresholds: [],
  }));
  jest.spyOn(LabelsRepository.prototype, 'listLabels').mockResolvedValue([
    { value: 'namespace', label: 'namespace' },
    { value: 'cluster', label: 'cluster' },
  ]);
  jest.spyOn(LabelsRepository.prototype, 'listLabelValues').mockResolvedValue([{ value: 'prod', label: 'prod' }]);
});
afterEach(() => jest.restoreAllMocks());

test('initial dropdown groups service search and label names with distinct icons', async () => {
  setup();
  if (typeof comboProps.options !== 'function') {
    throw new Error('Expected async options');
  }
  expect(await comboProps.options('name')).toEqual([
    expect.objectContaining({ value: 'service:name', group: 'Service name filter', icon: 'search' }),
    expect.objectContaining({ value: 'label:namespace', group: 'Label names', icon: 'tag-alt' }),
  ]);
});

test('an exact label match is the first highlighted option, matching the Enter action', async () => {
  setup();
  if (typeof comboProps.options !== 'function') {
    throw new Error('Expected async options');
  }
  expect(await comboProps.options('namespace')).toEqual([
    expect.objectContaining({ value: 'label:namespace', group: 'Label names' }),
    expect.objectContaining({ value: 'service:namespace', group: 'Service name filter' }),
  ]);
  expect((await comboProps.options('names'))[0].value).toBe('service:names');
});

test('service filters append as OR alternatives and can be removed individually', async () => {
  const { quickFilter } = setup('api.*');
  await enter('worker');
  expect(quickFilter.getUrlState()).toEqual({ searchText: 'api.*,worker' });
  expect(screen.getByText('OR')).toBeInTheDocument();
  await enter('scheduler');
  expect(quickFilter.state.searchText).toBe('api.*,worker,scheduler');
  expect(screen.getAllByText('OR')).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: /Remove/ })[1]);
  expect(quickFilter.state.searchText).toBe('api.*,scheduler');
  expect(screen.getAllByText('OR')).toHaveLength(1);
});

test('an exact label enters the standard partial-chip, operator, and value flow, then repeats', async () => {
  const { model, quickFilter } = setup('api');
  await enter('namespace');
  expect(quickFilter.state.searchText).toBe('api');
  expect(screen.getByText('namespace')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Combined filter' })).not.toBeInTheDocument();
  expect(await screen.findByText('is empty')).toBeInTheDocument();
  expect(screen.getByText('in')).toBeInTheDocument();
  expect(screen.getByText('not in')).toBeInTheDocument();
  fireEvent.click(screen.getByText('='));
  fireEvent.click(await screen.findByText('prod'));
  await waitFor(() =>
    expect(model.state.filters).toEqual([expect.objectContaining({ key: 'namespace', operator: '=', value: 'prod' })])
  );
  await enter('cluster');
  expect(await screen.findByText('is empty')).toBeInTheDocument();
  expect(model.state.filters).toHaveLength(1);
  fireEvent.click(screen.getByText('is empty'));
  await waitFor(() => expect(model.state.filters).toHaveLength(2));
  expect(screen.getByRole('textbox', { name: 'Combined filter' })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Filter operator' })[1]);
  expect(await screen.findByText('not in')).toBeInTheDocument();
});

test('Escape restores the prior service search', () => {
  const { quickFilter } = setup('worker');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'cluster' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(quickFilter.state.searchText).toBe('worker');
});

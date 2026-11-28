import { sceneGraph } from '@grafana/scenes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { SaveSearchModal } from './SaveSearchModal';
import { asSceneObject, getSaveSearchMock, getUtilsMock } from './testHelpers';

jest.mock('react-inlinesvg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('svg', {}),
  };
});
jest.mock('./saveSearch', () => ({
  useSavedSearches: jest.fn(),
  useCheckForExistingSearch: jest.fn(),
}));
jest.mock('./utils', () => ({
  getFiltersVariable: jest.fn(),
  getProfilesExplorerScene: jest.fn(),
  filtersToLabelSelectorExpression: jest.fn(),
}));
jest.mock('../../../pages/ProfilesExplorerView/domain/variables/FiltersVariable/filters-ops');
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getAppEvents: () => ({ publish: () => {} }),
}));

const saveSearch = getSaveSearchMock();
const utils = getUtilsMock();

describe('SaveSearchModal', () => {
  const mockOnClose = jest.fn();
  const mockSaveSearch = jest.fn();
  const mockSceneRef = asSceneObject({});

  beforeEach(() => {
    jest.clearAllMocks();
    saveSearch.useCheckForExistingSearch.mockReturnValue(undefined);
    utils.filtersToLabelSelectorExpression.mockReturnValue('{job="test"}');
    jest.spyOn(sceneGraph, 'getAncestor').mockReturnValue(asSceneObject({}));
    utils.getProfilesExplorerScene.mockReturnValue({});
    utils.getFiltersVariable.mockReturnValue({
      state: { filters: [] },
      useState: () => ({ filters: [] }),
    });
    saveSearch.useSavedSearches.mockReturnValue({
      saveSearch: mockSaveSearch,
      isLoading: false,
      searches: [],
      deleteSearch: jest.fn(),
    });
  });

  test('renders the modal with query', () => {
    render(<SaveSearchModal dsUid="test-ds" onClose={mockOnClose} sceneRef={mockSceneRef} />);

    expect(screen.getByText('Save query')).toBeInTheDocument();
    expect(screen.getByText('{job="test"}')).toBeInTheDocument();
  });

  test('submits the form with title and description', async () => {
    mockSaveSearch.mockResolvedValue(undefined);

    render(<SaveSearchModal dsUid="test-ds" onClose={mockOnClose} sceneRef={mockSceneRef} />);

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My Search' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Test description' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockSaveSearch).toHaveBeenCalledWith({
        description: 'Test description',
        dsUid: 'test-ds',
        query: '{job="test"}',
        title: 'My Search',
      });
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  test('shows alert when search already exists', () => {
    saveSearch.useCheckForExistingSearch.mockReturnValue({
      description: 'Test description',
      dsUid: 'test-ds',
      query: '{job="test"}',
      title: 'Existing Search',
      timestamp: 123456,
      uid: 'test',
    });

    render(<SaveSearchModal dsUid="test-ds" onClose={mockOnClose} sceneRef={mockSceneRef} />);

    expect(screen.getByText(/previously saved query/i)).toBeInTheDocument();
    expect(screen.getByText(/existing search/i)).toBeInTheDocument();
  });

  test('disables submit button when title is empty', () => {
    render(<SaveSearchModal dsUid="test-ds" onClose={mockOnClose} sceneRef={mockSceneRef} />);

    const submitButton = screen.getByRole('button', { name: /^save$/i });
    expect(submitButton).toBeDisabled();
  });
});

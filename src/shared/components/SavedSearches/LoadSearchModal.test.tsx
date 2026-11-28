import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { LoadSearchModal } from './LoadSearchModal';
import type { SavedSearch } from './saveSearch';
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
  applySavedSearchToScene: jest.fn(),
}));
jest.mock('./utils', () => ({
  getDatasourceVariable: jest.fn(),
  getFiltersVariable: jest.fn(),
  getProfilesExplorerScene: jest.fn(),
}));

const saveSearch = getSaveSearchMock();
const utils = getUtilsMock();

const mockSearches: SavedSearch[] = [
  {
    uid: '1',
    title: 'Test Search 1',
    description: 'First test search',
    query: '{job="test1"}',
    dsUid: 'test-ds',
    timestamp: Date.now(),
  },
  {
    uid: '2',
    title: 'Test Search 2',
    description: 'Second test search',
    query: '{job="test2"}',
    dsUid: 'test-ds',
    timestamp: Date.now() - 1,
  },
];

describe('LoadSearchModal', () => {
  const mockOnClose = jest.fn();
  const mockDeleteSearch = jest.fn();
  const mockSceneRef = asSceneObject({});

  beforeEach(() => {
    jest.clearAllMocks();
    utils.getDatasourceVariable.mockReturnValue({
      getValue: () => 'test-ds',
      changeValueTo: jest.fn(),
    });
    utils.getProfilesExplorerScene.mockReturnValue({});
    utils.getFiltersVariable.mockReturnValue({ setState: jest.fn() });
    saveSearch.useSavedSearches.mockReturnValue({
      saveSearch: jest.fn(),
      searches: mockSearches,
      isLoading: false,
      deleteSearch: mockDeleteSearch,
    });
  });

  test('renders the modal with saved searches', () => {
    render(<LoadSearchModal onClose={mockOnClose} sceneRef={mockSceneRef} />);

    expect(screen.getAllByText('Test Search 1')).toHaveLength(2);
    expect(screen.getByText('Test Search 2')).toBeInTheDocument();
  });

  test('Renders empty state when no searches', () => {
    saveSearch.useSavedSearches.mockReturnValue({
      saveSearch: jest.fn(),
      searches: [],
      isLoading: false,
      deleteSearch: mockDeleteSearch,
    });

    render(<LoadSearchModal onClose={mockOnClose} sceneRef={mockSceneRef} />);

    expect(screen.getByText('No saved queries to display.')).toBeInTheDocument();
  });

  test('Selects a search when clicked', () => {
    render(<LoadSearchModal onClose={mockOnClose} sceneRef={mockSceneRef} />);

    fireEvent.click(screen.getAllByLabelText('Test Search 2')[0]);

    expect(screen.getByText('{job="test2"}')).toBeInTheDocument();
  });

  test('Applies filters and closes when Select is clicked', () => {
    render(<LoadSearchModal onClose={mockOnClose} sceneRef={mockSceneRef} />);

    fireEvent.click(screen.getByRole('button', { name: /^select$/i }));

    expect(saveSearch.applySavedSearchToScene).toHaveBeenCalledWith(mockSceneRef, '{job="test1"}', 'test-ds');
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('Calls deleteSearch when delete button is clicked', () => {
    render(<LoadSearchModal onClose={mockOnClose} sceneRef={mockSceneRef} />);

    const deleteButton = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(deleteButton);

    expect(mockDeleteSearch).toHaveBeenCalledWith('1');
  });
});

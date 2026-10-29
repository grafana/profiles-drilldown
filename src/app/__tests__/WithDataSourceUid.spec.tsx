import { getDataSourceInstanceList } from '@grafana/plugin-compat/datasources';
import { useDataSourceUid } from '@shared/infrastructure/datasource/DataSourceUidContext';
import { userStorage } from '@shared/infrastructure/userStorage';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

import { WithDataSourceUid } from '../WithDataSourceUid';

jest.mock('@grafana/plugin-compat/datasources', () => ({
  getDataSourceInstanceList: jest.fn(),
  getDataSourceInstanceSettings: jest.fn(),
  getDefaultDataSourceInstanceListItem: jest.fn(),
}));

const getDataSourceInstanceListMock = jest.mocked(getDataSourceInstanceList);

const Page = () => (
  <>
    {useDataSourceUid()}
    <Link to="/settings">Settings</Link>
    <Link to="/explore?var-dataSource=pyroscope-def">Explore</Link>
  </>
);

const storeDataSource = (uid: string) => userStorage.set(userStorage.KEYS.PROFILES_EXPLORER, { dataSource: uid });

const renderRoutes = () =>
  render(
    <MemoryRouter initialEntries={['/explore']}>
      <Routes>
        <Route element={<WithDataSourceUid />}>
          <Route path="/explore" element={<Page />} />
          <Route path="/settings" element={<Page />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('WithDataSourceUid', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getDataSourceInstanceListMock.mockResolvedValue([{ uid: 'pyroscope-abc' }, { uid: 'pyroscope-def' }] as any);
    storeDataSource('pyroscope-abc');
  });

  afterEach(() => {
    setWindowLocation(new URL('http://localhost:3000/'));
    localStorage.clear();
  });

  it('should show a placeholder while the datasource resolves', () => {
    renderRoutes();

    expect(screen.getByText('Selecting datasource...')).toBeInTheDocument();
  });

  it('should show the selection error', async () => {
    getDataSourceInstanceListMock.mockRejectedValue(new Error('Datasource not found'));

    renderRoutes();

    expect(await screen.findByText('Datasource not found')).toBeInTheDocument();
  });

  it('should re-resolve the datasource when navigating to another page', async () => {
    renderRoutes();
    await screen.findByText('pyroscope-abc');

    storeDataSource('pyroscope-def');
    fireEvent.click(screen.getByText('Settings'));

    expect(await screen.findByText('pyroscope-def')).toBeInTheDocument();
  });

  it('should prefer the URL datasource when navigating back to Explore', async () => {
    renderRoutes();
    await screen.findByText('pyroscope-abc');

    fireEvent.click(screen.getByText('Settings'));
    await screen.findByText('pyroscope-abc');
    // the resolver reads window.location, not the memory router
    setWindowLocation(new URL('http://localhost:3000/?var-dataSource=pyroscope-def'));
    fireEvent.click(screen.getByText('Explore'));

    expect(await screen.findByText('pyroscope-def')).toBeInTheDocument();
  });
});

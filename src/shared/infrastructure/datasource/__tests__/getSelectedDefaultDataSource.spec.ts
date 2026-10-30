import {
  getDataSourceInstanceList,
  getDataSourceInstanceSettings,
  getDefaultDataSourceInstanceListItem,
} from '@grafana/plugin-compat/datasources';
import { userStorage } from '@shared/infrastructure/userStorage';

import { getSelectedDefaultDataSource } from '../useSelectDefaultDataSourceUid';

jest.mock('@grafana/plugin-compat/datasources', () => ({
  getDataSourceInstanceList: jest.fn(),
  getDataSourceInstanceSettings: jest.fn(),
  getDefaultDataSourceInstanceListItem: jest.fn(),
}));

jest.mock('@shared/infrastructure/tracking/logger', () => ({
  logger: { warn: jest.fn() },
}));

const getDataSourceInstanceListMock = jest.mocked(getDataSourceInstanceList);
const getDataSourceInstanceSettingsMock = jest.mocked(getDataSourceInstanceSettings);
const getDefaultDataSourceInstanceListItemMock = jest.mocked(getDefaultDataSourceInstanceListItem);

type MockDataSource = { uid: string; isDefault?: boolean; jsonData: { overridesDefault?: boolean } };

function givenDataSources(dataSources: MockDataSource[]) {
  const instances = dataSources.map(({ uid }) => ({ uid }));
  const defaultUid = dataSources.find((ds) => ds.isDefault)?.uid;
  getDataSourceInstanceListMock.mockResolvedValue(instances as any);
  getDataSourceInstanceSettingsMock.mockImplementation(async (uid) => dataSources.find((ds) => ds.uid === uid) as any);
  getDefaultDataSourceInstanceListItemMock.mockResolvedValue(instances.find((ds) => ds.uid === defaultUid) as any);
}

const ds = (uid: string, extra: Partial<MockDataSource> = {}) => ({ uid, jsonData: {}, ...extra });
const storeDataSource = (uid: string) => userStorage.set(userStorage.KEYS.PROFILES_EXPLORER, { dataSource: uid });

describe('getSelectedDefaultDataSource()', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    givenDataSources([]);
  });

  afterEach(() => {
    setWindowLocation(new URL('http://localhost:3000/'));
    localStorage.clear();
  });

  it('should prefer the URL datasource over the stored one', async () => {
    givenDataSources([ds('pyroscope-abc'), ds('pyroscope-def')]);
    storeDataSource('pyroscope-abc');
    setWindowLocation(new URL('http://localhost:3000/?var-dataSource=pyroscope-def'));

    const dataSource = await getSelectedDefaultDataSource();

    expect(dataSource?.uid).toBe('pyroscope-def');
  });

  it('should prefer the stored datasource over the overriding one', async () => {
    givenDataSources([ds('pyroscope-abc', { jsonData: { overridesDefault: true } }), ds('pyroscope-def')]);
    storeDataSource('pyroscope-def');

    const dataSource = await getSelectedDefaultDataSource();

    expect(dataSource?.uid).toBe('pyroscope-def');
  });

  it('should skip settings and default lookups when the URL datasource matches', async () => {
    givenDataSources([ds('pyroscope-abc'), ds('pyroscope-def')]);
    setWindowLocation(new URL('http://localhost:3000/?var-dataSource=pyroscope-def'));

    const dataSource = await getSelectedDefaultDataSource();

    expect(dataSource).toEqual({ uid: 'pyroscope-def' });
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(1);
    expect(getDataSourceInstanceSettingsMock).not.toHaveBeenCalled();
    expect(getDefaultDataSourceInstanceListItemMock).not.toHaveBeenCalled();
  });

  it('should skip settings and default lookups when the stored datasource matches an invalid URL fallback', async () => {
    givenDataSources([ds('pyroscope-abc'), ds('pyroscope-def')]);
    setWindowLocation(new URL('http://localhost:3000/?var-dataSource=loki-abc'));
    storeDataSource('pyroscope-def');

    const dataSource = await getSelectedDefaultDataSource();

    expect(dataSource).toEqual({ uid: 'pyroscope-def' });
    expect(getDataSourceInstanceListMock).toHaveBeenCalledTimes(1);
    expect(getDataSourceInstanceSettingsMock).not.toHaveBeenCalled();
    expect(getDefaultDataSourceInstanceListItemMock).not.toHaveBeenCalled();
  });

  it('should prefer the overriding datasource over the Grafana default', async () => {
    givenDataSources([
      ds('pyroscope-abc', { isDefault: true }),
      ds('pyroscope-def', { jsonData: { overridesDefault: true } }),
    ]);

    const dataSource = await getSelectedDefaultDataSource();

    expect(dataSource?.uid).toBe('pyroscope-def');
    expect(getDataSourceInstanceSettingsMock).toHaveBeenCalledTimes(2);
    expect(getDefaultDataSourceInstanceListItemMock).not.toHaveBeenCalled();
  });

  it('should prefer the Grafana default over the first datasource', async () => {
    givenDataSources([ds('pyroscope-abc'), ds('pyroscope-def', { isDefault: true })]);

    const dataSource = await getSelectedDefaultDataSource();

    expect(dataSource?.uid).toBe('pyroscope-def');
  });

  it('should ignore a URL uid that is not a Pyroscope datasource', async () => {
    givenDataSources([ds('pyroscope-abc'), ds('pyroscope-def')]);
    setWindowLocation(new URL('http://localhost:3000/?var-dataSource=loki-abc'));

    const dataSource = await getSelectedDefaultDataSource();

    expect(dataSource?.uid).toBe('pyroscope-abc');
  });

  it('should return undefined when there is no Pyroscope datasource', async () => {
    const dataSource = await getSelectedDefaultDataSource();

    expect(dataSource).toBeUndefined();
  });
});

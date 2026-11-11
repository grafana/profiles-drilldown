import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { getAppPluginVersion } from '@grafana/runtime';

import { GIT_COMMIT } from '../../../../../version';
import { initFaro, setFaro } from '../faro';

// Faro dependencies
jest.mock('@grafana/faro-web-sdk');
jest.mock('../interactionEchoBackend', () => ({
  registerFaroInteractionEchoBackend: jest.fn(),
}));

// Grafana dependency
jest.mock('@grafana/runtime', () => ({
  config: {
    bootData: {
      user: {
        email: 'sixty.four@grafana.com',
      },
    },
    buildInfo: {
      version: '11.5.0',
      edition: 'Enterprise',
    },
  },
  getAppPluginVersion: jest.fn(),
}));

const getAppPluginVersionMock = jest.mocked(getAppPluginVersion);

function setup(location: Partial<Location>) {
  (initializeFaro as jest.Mock).mockReturnValue({});
  (getWebInstrumentations as jest.Mock).mockReturnValue([{}]);

  setWindowLocation(location);

  return {
    initializeFaro: initializeFaro as jest.Mock,
  };
}

describe('initFaro()', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getAppPluginVersionMock.mockResolvedValue('v0.01-test');
  });

  afterEach(() => {
    setFaro(null);
  });

  describe('when running in environment where the host not defined', () => {
    test('does not initialize Faro', async () => {
      const { initializeFaro } = setup({ host: undefined });

      await initFaro();

      expect(initializeFaro).not.toHaveBeenCalled();
    });
  });

  describe('when running in an unknown environment', () => {
    test('does not initialize Faro', async () => {
      const { initializeFaro } = setup({ host: 'unknownhost' });

      await initFaro();

      expect(initializeFaro).not.toHaveBeenCalled();
    });
  });

  describe('when running in an known environment', () => {
    test.each([
      // dev
      [
        'grafana-dev.net',
        'https://faro-collector-ops-eu-south-0.grafana-ops.net/collect/48e03a2647389f2f6494af7f975b4084',
        'grafana-pyroscope-dev',
      ],
      [
        'test.grafana-dev.net',
        'https://faro-collector-ops-eu-south-0.grafana-ops.net/collect/48e03a2647389f2f6494af7f975b4084',
        'grafana-pyroscope-dev',
      ],
      // ops
      [
        'foobar.grafana-ops.net',
        'https://faro-collector-ops-eu-south-0.grafana-ops.net/collect/b5cfd5eeb412cf5e74bd828b4ddd17ff',
        'grafana-pyroscope-ops',
      ],
      [
        'grafana-ops.net',
        'https://faro-collector-ops-eu-south-0.grafana-ops.net/collect/b5cfd5eeb412cf5e74bd828b4ddd17ff',
        'grafana-pyroscope-ops',
      ],
      // prod
      [
        'foobar.grafana.net',
        'https://faro-collector-ops-eu-south-0.grafana-ops.net/collect/6cbe17b3af4b72ce5936bf4d15a5c393',
        'grafana-pyroscope-prod',
      ],
      [
        'grafana.net',
        'https://faro-collector-ops-eu-south-0.grafana-ops.net/collect/6cbe17b3af4b72ce5936bf4d15a5c393',
        'grafana-pyroscope-prod',
      ],
    ])('initializes Faro for the host "%s"', async (host, faroUrl, appName) => {
      const { initializeFaro } = setup({ host });

      await initFaro();

      expect(initializeFaro).toHaveBeenCalledTimes(1);
      expect(initializeFaro.mock.lastCall[0].url).toBe(faroUrl);
      expect(initializeFaro.mock.lastCall[0].app.name).toBe(appName);
    });

    test('initializes Faro with the proper configuration', async () => {
      const { initializeFaro } = setup({ host: 'grafana.net' });

      await initFaro();

      const { app, user, instrumentations, isolate, beforeSend } = initializeFaro.mock.lastCall[0];

      expect(app).toStrictEqual({
        name: 'grafana-pyroscope-prod',
        release: 'v0.01-test',
        version: GIT_COMMIT,
        environment: 'prod',
        namespace: 'v11.5.0 (Enterprise)',
      });

      expect(user).toStrictEqual({ email: 'sixty.four@grafana.com' });

      expect(getWebInstrumentations).toHaveBeenCalledWith({
        captureConsole: false,
      });
      expect(instrumentations).toBeInstanceOf(Array);
      expect(instrumentations.length).toBe(1);

      expect(isolate).toBe(true);
      expect(beforeSend).toBeInstanceOf(Function);
    });
  });

  describe('when called several times', () => {
    test('initializes Faro only once', async () => {
      const { initializeFaro } = setup({ host: 'grafana.net' });

      await initFaro();
      await initFaro();

      expect(initializeFaro).toHaveBeenCalledTimes(1);
    });
  });
});

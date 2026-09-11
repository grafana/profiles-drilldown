import { dateMath } from '@grafana/data';
import { logger } from '@shared/infrastructure/tracking/logger';

import { builsShareableUrl, getShareableUrlText } from '../builsShareableUrl';

jest.mock('@shared/infrastructure/tracking/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

const BASE_URL = 'http://localhost:3000/a/grafana-pyroscope-app/profiles-explorer?explorationType=diff-flame-graph';

describe('builsShareableUrl()', () => {
  const originalNow = Date.now;

  beforeEach(() => {
    // Grafana's dateMath() uses Moment under the hood, which in turns, uses Date.now()
    // see https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/datetime/datemath.ts
    Date.now = () => 1729252333247;
  });

  afterEach(() => {
    Date.now = originalNow;
  });

  test.each([
    ['no params', new URL(BASE_URL), `${BASE_URL}&from=1729250533247&to=1729252333247`],
    ['relative from/to', new URL(`${BASE_URL}&from=now-30m&to=now`), `${BASE_URL}&from=1729250533247&to=1729252333247`],
    [
      'relative from-x/to-x',
      new URL(`${BASE_URL}&from-2=now-20m&to-2=now-10m&from-3=now-15m&to-3=now-5m`),
      `${BASE_URL}&from-2=1729251133247&to-2=1729251733247&from-3=1729251433247&to-3=1729252033247&from=1729250533247&to=1729252333247`,
    ],
    [
      'relative diffFrom-x/diffTo-x',
      new URL(`${BASE_URL}&diffFrom=now-18m&diffTo=now-12m&diffFrom-2=now-7m&diffTo-2=now-3m`),
      `${BASE_URL}&diffFrom=1729251253247&diffTo=1729251613247&diffFrom-2=1729251913247&diffTo-2=1729252153247&from=1729250533247&to=1729252333247`,
    ],
    [
      'absolute from/to',
      new URL(`${BASE_URL}&from=2024-10-18T11:33:44.687Z&to=2024-10-18T12:03:44.687Z`),
      `${BASE_URL}&from=1729251224687&to=1729253024687`,
    ],
    [
      'mixed relative/absolute from/to',
      new URL(`${BASE_URL}&from=now-1d&to=2024-10-18T12:03:44.687Z`),
      `${BASE_URL}&from=1729165933247&to=1729253024687`,
    ],
    ['malformed from', new URL(`${BASE_URL}&from=not-a-date&to=now`), `${BASE_URL}&from=not-a-date&to=1729252333247`],
    [
      'malformed relative from',
      new URL(`${BASE_URL}&from=now-bogus&to=now`),
      `${BASE_URL}&from=now-bogus&to=1729252333247`,
    ],
  ])('%s (%s)', (msg, location, expectedUrl) => {
    setWindowLocation(location);

    expect(builsShareableUrl().toString()).toBe(expectedUrl);
  });

  describe('getShareableUrlText()', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns the shareable URL', () => {
      setWindowLocation(new URL(BASE_URL));

      expect(getShareableUrlText()).toBe(`${BASE_URL}&from=1729250533247&to=1729252333247`);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs errors from builsShareableUrl() without throwing or alerting', () => {
      setWindowLocation(new URL(BASE_URL));
      jest.spyOn(dateMath, 'toDateTime').mockImplementation(() => {
        throw new Error('malformed time');
      });

      expect(getShareableUrlText()).toBe(BASE_URL);
      expect(logger.error).toHaveBeenCalledWith(expect.any(Error), { handheldBy: 'getShareableUrlText' });
    });
  });
});

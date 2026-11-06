import { grafanaFetch } from '../grafanaFetch';

jest.mock('@shared/infrastructure/http/grafanaFetch', () => ({
  grafanaFetch: jest.fn(),
}));

const grafanaFetchMock = jest.mocked(grafanaFetch);

afterEach(() => {
  grafanaFetchMock.mockRestore();
});

type FetchMock = jest.Mock<Promise<Response>, [url: string, options?: RequestInit]>;

export function mockGrafanaFetch(respond: (url: string) => unknown = () => ({})): FetchMock {
  const fetch: FetchMock = jest.fn(async (url) => ({ ok: true, json: async () => respond(url) } as Response));

  grafanaFetchMock.mockImplementation(({ url, options }) => fetch(url, options));

  return fetch;
}

export function mockPendingGrafanaFetch(): FetchMock {
  return mockGrafanaFetch().mockImplementation(() => new Promise<Response>(() => {}));
}

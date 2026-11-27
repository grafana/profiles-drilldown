import { grafanaFetch } from '../grafanaFetch';

jest.mock('@shared/infrastructure/http/grafanaFetch', () => ({
  grafanaFetch: jest.fn(),
}));

const grafanaFetchMock = jest.mocked(grafanaFetch);

afterEach(() => {
  grafanaFetchMock.mockRestore();
});

type FetchInput = Parameters<typeof grafanaFetch>[0];

export function mockGrafanaFetch(respond: (input: FetchInput) => unknown = () => ({})) {
  const fetch = jest.fn<Promise<Response>, [FetchInput]>(
    async (input) => ({ ok: true, json: async () => respond(input) } as Response)
  );

  grafanaFetchMock.mockImplementation(fetch);

  return fetch;
}

export function mockPendingGrafanaFetch() {
  return mockGrafanaFetch().mockImplementation(() => new Promise<Response>(() => {}));
}

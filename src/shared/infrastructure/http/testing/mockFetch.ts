const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

type FetchMock = jest.Mock<Promise<Response>, [url: string, options?: RequestInit]>;

export function mockFetch(respond: (url: string) => unknown = () => ({})): FetchMock {
  const fetch: FetchMock = jest.fn(async (url) => ({ ok: true, json: async () => respond(url) } as Response));
  global.fetch = fetch as unknown as typeof global.fetch;
  return fetch;
}

export function mockPendingFetch(): FetchMock {
  const fetch: FetchMock = jest.fn<Promise<Response>, [url: string, options?: RequestInit]>(
    () => new Promise(() => {})
  );
  global.fetch = fetch as unknown as typeof global.fetch;
  return fetch;
}

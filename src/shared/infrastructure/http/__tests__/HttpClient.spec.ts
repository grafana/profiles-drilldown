import { HttpClient, isAbortError } from '../HttpClient';

const originalFetch = global.fetch;

type FetchImplementation = (pathname: string | URL | Request, options?: RequestInit) => Promise<any>;

type BuildClientReturnValue = {
  client: HttpClient;
  fetch: any; // couldn't find any suitable type (jest.MockedFunction<FetchImplementation> didn't work)
};

function buildClient(fetchImplementation: FetchImplementation = async () => ({ ok: true })): BuildClientReturnValue {
  const client = new HttpClient('http://localhost', { 'content-type': 'application/json' });

  global.fetch = jest.fn(fetchImplementation);

  return {
    client,
    fetch,
  };
}

describe('isAbortError', () => {
  it('should recognize an AbortError DOMException', () => {
    expect(isAbortError(new DOMException('Cancelled', 'AbortError'))).toBe(true);
  });

  it('should reject other DOMExceptions', () => {
    expect(isAbortError(new DOMException('Missing', 'NotFoundError'))).toBe(false);
  });

  it('should reject a regular error named AbortError', () => {
    const error = new Error('Cancelled');
    error.name = 'AbortError';

    expect(isAbortError(error)).toBe(false);
  });
});

describe('HttpClient', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetch(pathname, options)', () => {
    it('calls the native fetch with the correct URL and options', async () => {
      const { client, fetch } = buildClient();

      await client.fetch('/test');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/test',
        expect.objectContaining({
          headers: { 'content-type': 'application/json' },
          signal: expect.any(AbortSignal),
        })
      );
    });

    describe('when passing options.headers', () => {
      it('adds them to the options passed to the native fetch', async () => {
        const { client, fetch } = buildClient();

        const options = {
          headers: {
            cookie: 'redirect_to=%2Fa%2Fgrafana-llmexamples-app',
          },
        };

        await client.fetch('/test', options);

        expect(fetch).toHaveBeenCalledWith(
          'http://localhost/test',
          expect.objectContaining({
            headers: {
              'content-type': 'application/json',
              cookie: 'redirect_to=%2Fa%2Fgrafana-llmexamples-app',
            },
          })
        );
      });
    });

    describe('when passing options.signal', () => {
      it('add it to the options passed to the native fetch', async () => {
        const { client, fetch } = buildClient();

        const { signal } = new AbortController();

        const options = {
          signal,
        };

        await client.fetch('/test', options);

        const [fetchArgs] = fetch.mock.calls;

        expect(fetchArgs[0]).toBe('http://localhost/test');
        // weirdly we have to do this, using expect.toEqual() or expect.objectContaining() leads to false positive
        expect(fetchArgs[1]?.signal === signal).toBe(true);
      });
    });

    describe('if the request returns a non-ok response', () => {
      it('throws an error', async () => {
        const { client } = buildClient(async () => ({
          ok: false,
          status: -1,
          statusText: 'Test error',
          json: async () => ({}),
        }));

        await expect(client.fetch('/test')).rejects.toEqual(new Error('HTTP -1 (Test error)'));
      });
    });

    describe('if the native fetch throws an error', () => {
      it('rethrows the error', async () => {
        const fetchError = new Error('Ooops! Failed to fetch.');

        const { client } = buildClient(async () => {
          throw fetchError;
        });

        await expect(client.fetch('/test')).rejects.toEqual(fetchError);
      });
    });
  });

  describe('isAbortError(error)', () => {
    it('returns true in case of a DOMException AbortError', () => {
      const { client } = buildClient();

      const error = new DOMException('Ooops!', 'AbortError');

      expect(client.isAbortError(error)).toBe(true);
    });

    it('returns false otherwise', () => {
      const { client } = buildClient();

      const error = new TypeError('Ooops!');

      expect(client.isAbortError(error)).toBe(false);
    });
  });
});

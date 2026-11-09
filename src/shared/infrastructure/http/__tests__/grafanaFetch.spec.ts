import { type BackendSrv, FetchResponse, setBackendSrv } from '@grafana/runtime';
import { of, throwError } from 'rxjs';

import {
  getHttpFailure,
  grafanaFetch,
  toBackendSrvRequest,
  toCancellationError,
  toErrorBody,
  toResponse,
} from '../grafanaFetch';

const url = '/api/datasources/proxy/uid/pyroscope-abc';
const options = {
  method: 'GET',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message: 'hello world' }),
  signal: new AbortController().signal,
  credentials: 'include' as RequestCredentials,
};

describe('toBackendSrvRequest', () => {
  it('should use defaults when there are no options', () => {
    expect(toBackendSrvRequest({ url, options: {} })).toStrictEqual({
      abortSignal: undefined,
      credentials: undefined,
      data: undefined,
      headers: {},
      method: undefined,
      responseType: 'blob',
      showErrorAlert: false,
      showSuccessAlert: false,
      url: '/api/datasources/proxy/uid/pyroscope-abc',
    });
  });

  it('should create correct shape when there are options', () => {
    expect(toBackendSrvRequest({ url, options: { ...options } })).toStrictEqual({
      abortSignal: options.signal,
      credentials: 'include',
      data: '{"message":"hello world"}',
      headers: { 'content-type': 'application/json' },
      method: 'GET',
      responseType: 'blob',
      showErrorAlert: false,
      showSuccessAlert: false,
      url: '/api/datasources/proxy/uid/pyroscope-abc',
    });
  });
});

describe('toCancellationError', () => {
  it('should preserve an existing abort exception', () => {
    const error = new DOMException('Cancelled', 'AbortError');

    expect(toCancellationError({ error }) === error).toBe(true);
  });

  it('should normalize SDK cancellation to an abort exception', () => {
    expect(toCancellationError({ error: { status: -1, data: null, cancelled: true } })).toStrictEqual(
      new DOMException('The request was aborted', 'AbortError')
    );
  });

  it('should recognize an aborted caller signal', () => {
    const controller = new AbortController();
    controller.abort('Discarded');

    expect(toCancellationError({ error: new Error('Cancelled'), signal: controller.signal })).toStrictEqual(
      new DOMException('The request was aborted', 'AbortError')
    );
  });
});

describe('getHttpFailure', () => {
  it('should recognize an HTTP failure', () => {
    expect(getHttpFailure({ error: { status: 404, data: 'Missing' } })).toStrictEqual({ data: 'Missing', status: 404 });
  });

  it('should reject a transport failure status', () => {
    expect(getHttpFailure({ error: { status: 0, data: null } })).toBeUndefined();
  });

  it('should reject a native fetch error', () => {
    expect(getHttpFailure({ error: new TypeError('Offline') })).toBeUndefined();
  });
});

describe('toErrorBody', () => {
  it('should preserve a blob body', () => {
    const body = new Blob(['Missing']);

    expect(toErrorBody({ data: body })).toBe(body);
  });

  it('should preserve a text body', () => {
    const body = 'Missing';

    expect(toErrorBody({ data: 'Missing' })).toBe(body);
  });

  it('should serialize a JSON body', () => {
    expect(toErrorBody({ data: { message: 'Missing' } })).toBe('{"message":"Missing"}');
  });

  it('should omit a circular error body', () => {
    const data: Record<string, unknown> = {};
    data.self = data;

    expect(toErrorBody({ data })).toBeUndefined();
  });
});

describe('toResponse', () => {
  const responseCtor = jest.fn();
  beforeEach(() => {
    Object.defineProperty(global, 'Response', { configurable: true, value: responseCtor });
  });

  afterEach(() => {
    Reflect.deleteProperty(global, 'Response');
  });

  it('should create a correct response with data as the body', () => {
    const data = new Blob(['{"message":"hello world"}'], { type: 'application/json' });
    const status = 200;
    const statusText = 'Ok';
    const headers = new Headers({ 'content-type': 'application/json' });
    const response = { data, status, statusText, headers } as FetchResponse<Blob>;

    toResponse(response);

    expect(responseCtor).toHaveBeenCalledWith(new Blob(['{"message":"hello world"}'], { type: 'application/json' }), {
      headers: new Headers({ 'content-type': 'application/json' }),
      status: 200,
      statusText: 'Ok',
    });
  });

  it.each([204, 205, 304])('should create a correct response with a null body for status %s', (status) => {
    const data = new Blob(['{"message":"hello world"}'], { type: 'application/json' });
    const statusText = 'Ok';
    const headers = new Headers({ 'content-type': 'application/json' });
    const response = { data, status, statusText, headers } as FetchResponse<Blob>;

    toResponse(response);

    expect(responseCtor).toHaveBeenCalledWith(null, {
      headers: new Headers({ 'content-type': 'application/json' }),
      status,
      statusText: 'Ok',
    });
  });
});

describe('grafanaFetch', () => {
  const responseCtor = jest.fn();
  let backendSrvMock: BackendSrv;
  let fetch: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();

    Object.defineProperty(global, 'Response', { configurable: true, value: responseCtor });
    fetch = jest.fn();

    backendSrvMock = {
      chunked: jest.fn(),
      delete: jest.fn(),
      fetch,
      get: jest.fn(),
      patch: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      datasourceRequest: jest.fn(),
      request: jest.fn(),
    };

    setBackendSrv(backendSrvMock);
  });

  afterEach(() => {
    Reflect.deleteProperty(global, 'Response');
  });

  it('should return a native response if everything goes as expected', async () => {
    fetch.mockReturnValue(
      of({
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        redirected: false,
        type: 'basic',
        url,
        config: toBackendSrvRequest({ url, options }),
        data: new Blob(['{"message":"hello world"}'], { type: 'application/json' }),
      })
    );

    const response = await grafanaFetch({ url, options });

    expect(responseCtor).toHaveBeenCalledWith(new Blob(['{"message":"hello world"}'], { type: 'application/json' }), {
      headers: new Headers(),
      status: 200,
      statusText: 'OK',
    });
    expect(response).toBeInstanceOf(Response);
  });

  it('should rethrow an existing abort error unchanged', async () => {
    const abortError = new DOMException('Cancelled', 'AbortError');
    fetch.mockReturnValue(throwError(() => abortError));

    await expect(grafanaFetch({ url, options })).rejects.toBe(abortError);
  });

  it('should reject a cancelled request with an abort error', async () => {
    fetch.mockReturnValue(throwError(() => ({ status: -1, data: null, cancelled: true })));

    await expect(grafanaFetch({ url, options })).rejects.toStrictEqual(
      new DOMException('The request was aborted', 'AbortError')
    );
  });

  it('should reject with an abort error when the caller signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort('Discarded');
    fetch.mockReturnValue(throwError(() => new Error('Cancelled')));

    await expect(grafanaFetch({ url, options: { ...options, signal: controller.signal } })).rejects.toStrictEqual(
      new DOMException('The request was aborted', 'AbortError')
    );
  });

  it('should return a response for an HTTP failure', async () => {
    fetch.mockReturnValue(
      throwError(() => ({
        status: 404,
        statusText: 'Not Found',
        data: { message: 'Missing' },
        config: toBackendSrvRequest({ url, options }),
      }))
    );

    const response = await grafanaFetch({ url, options });

    expect(responseCtor).toHaveBeenCalledWith('{"message":"Missing"}', {
      headers: undefined,
      status: 404,
      statusText: 'Not Found',
    });
    expect(response).toBeInstanceOf(Response);
  });

  it('should rethrow errors that are not HTTP failures', async () => {
    fetch.mockReturnValue(throwError(() => new TypeError('Offline')));

    await expect(grafanaFetch({ url, options })).rejects.toStrictEqual(new TypeError('Offline'));
  });
});

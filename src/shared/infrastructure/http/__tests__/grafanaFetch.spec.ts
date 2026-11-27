import { callDataSourcePluginProxy } from '@grafana/plugin-compat/datasources';
import type { FetchResponse } from '@grafana/runtime';

import {
  getHttpFailure,
  grafanaFetch,
  toCancellationError,
  toErrorBody,
  toProxyRequest,
  toResponse,
} from '../grafanaFetch';

jest.mock('@grafana/plugin-compat/datasources', () => ({ callDataSourcePluginProxy: jest.fn() }));

const proxy = jest.mocked(callDataSourcePluginProxy);
const input = {
  pluginId: 'grafana-pyroscope-datasource',
  uid: 'pyroscope-abc',
  routePath: 'querier.v1.QuerierService/SelectMergeProfile',
};

describe('toProxyRequest', () => {
  it('should use defaults when there are no options', () => {
    expect(toProxyRequest({})).toStrictEqual({
      abortSignal: undefined,
      credentials: undefined,
      data: undefined,
      headers: {},
      method: undefined,
      responseType: 'blob',
    });
  });

  it('should map request options', () => {
    expect(
      toProxyRequest({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"message":"hello world"}',
        credentials: 'include',
      })
    ).toStrictEqual({
      abortSignal: undefined,
      credentials: 'include',
      data: '{"message":"hello world"}',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      responseType: 'blob',
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

  beforeEach(() => {
    Object.defineProperty(global, 'Response', { configurable: true, value: responseCtor });
  });

  afterEach(() => {
    Reflect.deleteProperty(global, 'Response');
  });

  it('should forward a binary POST and preserve its response body', async () => {
    const signal = new AbortController().signal;
    const body = new Blob([new Uint8Array([0, 255])]);
    proxy.mockResolvedValue({
      data: body,
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: 'http://localhost',
      config: { url: 'http://localhost' },
    });

    const response = await grafanaFetch({
      ...input,
      options: { method: 'POST', headers: { 'content-type': 'application/proto' }, body, signal },
    });

    expect(proxy).toHaveBeenCalledWith({
      pluginId: 'grafana-pyroscope-datasource',
      uid: 'pyroscope-abc',
      routePath: 'querier.v1.QuerierService/SelectMergeProfile',
      showErrorAlert: false,
      request: expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/proto' },
        responseType: 'blob',
      }),
    });
    expect(proxy.mock.calls[0][0].request?.abortSignal).toBe(signal);
    expect(proxy.mock.calls[0][0].request?.data).toBe(body);
    expect(responseCtor.mock.calls[0][0]).toBe(body);
    expect(response).toBeInstanceOf(Response);
  });

  it('should reject a missing datasource proxy response', async () => {
    proxy.mockResolvedValue(undefined);

    await expect(grafanaFetch({ ...input, options: {} })).rejects.toThrow(
      'Grafana did not return a datasource proxy response'
    );
  });

  it('should rethrow an existing abort error unchanged', async () => {
    const abortError = new DOMException('Cancelled', 'AbortError');
    proxy.mockRejectedValue(abortError);

    await expect(grafanaFetch({ ...input, options: {} })).rejects.toBe(abortError);
  });

  it('should reject a cancelled request with an abort error', async () => {
    proxy.mockRejectedValue({ status: -1, data: null, cancelled: true });

    await expect(grafanaFetch({ ...input, options: {} })).rejects.toStrictEqual(
      new DOMException('The request was aborted', 'AbortError')
    );
  });

  it('should reject with an abort error when the caller signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort('Discarded');
    proxy.mockRejectedValue(new Error('Cancelled'));

    await expect(grafanaFetch({ ...input, options: { signal: controller.signal } })).rejects.toStrictEqual(
      new DOMException('The request was aborted', 'AbortError')
    );
  });

  it('should retain a 404 status and error message', async () => {
    proxy.mockRejectedValue({ status: 404, statusText: 'Not Found', data: { message: 'Missing' } });

    const response = await grafanaFetch({ ...input, options: {} });

    expect(responseCtor).toHaveBeenCalledWith('{"message":"Missing"}', {
      headers: undefined,
      status: 404,
      statusText: 'Not Found',
    });
    expect(response).toBeInstanceOf(Response);
  });

  it('should rethrow errors that are not HTTP failures', async () => {
    proxy.mockRejectedValue(new TypeError('Offline'));

    await expect(grafanaFetch({ ...input, options: {} })).rejects.toStrictEqual(new TypeError('Offline'));
  });
});

import { noOp } from '@shared/domain/noOp';

import { HttpClientError } from './HttpClientError';

export class HttpClient {
  defaultHeaders = {};
  abortController?: AbortController | null = null;
  private baseUrl = '';

  constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = Object.freeze(defaultHeaders);
  }

  async fetch(pathname: string, options?: RequestInit) {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const headers = { ...this.defaultHeaders, ...options?.headers };
    const fullOptions = {
      signal, // we allow signal to be passed as an option
      ...options,
      headers,
    };

    let response;

    try {
      const fullUrl = `${await this.getBaseUrl()}${pathname}`;
      response = await fetch(fullUrl, fullOptions);

      if (!response.ok) {
        throw new HttpClientError(response, await response.json().catch(noOp));
      }
    } catch (error) {
      if (this.isAbortError(error)) {
        (error as any).reason = options?.signal?.reason || signal.reason;
      }

      throw error;
    } finally {
      this.abortController = null;
    }

    return response;
  }

  abort(reason?: any) {
    if (this.abortController) {
      this.abortController.abort(reason);
    }
  }

  isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  async getBaseUrl(): Promise<string> {
    return this.baseUrl;
  }
}

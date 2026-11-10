import { noOp } from '@shared/domain/noOp';
import type { HttpRequestInput } from '@shared/infrastructure/types';

import { HttpClientError } from './HttpClientError';

export function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError';
}

export class HttpClient {
  baseUrl = '';
  defaultHeaders = {};
  abortController?: AbortController | null = null;

  constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = Object.freeze(defaultHeaders);
  }

  async fetch(url: string, options?: RequestInit) {
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
      response = await this.request({ url, options: fullOptions });

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

  protected request({ url, options }: HttpRequestInput): Promise<Response> {
    return fetch(`${this.baseUrl}${url}`, options);
  }

  abort(reason?: any) {
    if (this.abortController) {
      this.abortController.abort(reason);
    }
  }

  isAbortError(error: unknown) {
    return isAbortError(error);
  }
}

import { type BackendSrvRequest, type FetchError, getBackendSrv, isFetchError } from '@grafana/runtime';
import type { HttpRequestInput } from '@shared/infrastructure/types';
import { lastValueFrom } from 'rxjs';

interface GrafanaResponseInput {
  data?: BodyInit | null;
  status: number;
  statusText?: string;
  headers?: Headers;
}

export function toBackendSrvRequest({ url, options }: HttpRequestInput): BackendSrvRequest {
  return {
    url,
    method: options.method,
    headers: Object.fromEntries(new Headers(options.headers)),
    data: options.body,
    abortSignal: options.signal ?? undefined,
    credentials: options.credentials,
    responseType: 'blob',
    showErrorAlert: false,
    showSuccessAlert: false,
  };
}

export function toCancellationError({
  error,
  signal,
}: {
  error: unknown;
  signal?: AbortSignal | null;
}): DOMException | undefined {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return error;
  }

  if (signal?.aborted || (isFetchError(error) && error.cancelled)) {
    return new DOMException('The request was aborted', 'AbortError');
  }

  return undefined;
}

export function getHttpFailure({ error }: { error: unknown }): FetchError<unknown> | undefined {
  if (!isFetchError<unknown>(error)) {
    return undefined;
  }

  if (!Number.isInteger(error.status) || error.status < 300 || error.status > 599) {
    return undefined;
  }

  return error;
}

function tryStringify({ data }: { data: unknown }): string | undefined {
  try {
    return JSON.stringify(data);
  } catch {
    return undefined;
  }
}

export function toErrorBody({ data }: { data: unknown }): Blob | string | undefined {
  if (data instanceof Blob || typeof data === 'string') {
    return data;
  }

  return tryStringify({ data: data ?? {} });
}

export function toResponse({ data, status, statusText, headers }: GrafanaResponseInput): Response {
  const body = [204, 205, 304].includes(status) ? null : data;

  return new Response(body, { status, statusText, headers });
}

export async function grafanaFetch({ url, options }: HttpRequestInput): Promise<Response> {
  try {
    const response = await lastValueFrom(getBackendSrv().fetch<Blob>(toBackendSrvRequest({ url, options })));
    return toResponse(response);
  } catch (error) {
    const cancellation = toCancellationError({ error, signal: options.signal });
    if (cancellation) {
      throw cancellation;
    }

    const failure = getHttpFailure({ error });
    if (!failure) {
      throw error;
    }

    return toResponse({ ...failure, data: toErrorBody({ data: failure.data }) });
  }
}

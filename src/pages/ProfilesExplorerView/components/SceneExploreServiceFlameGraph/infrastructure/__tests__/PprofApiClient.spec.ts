import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { dateTime } from '@grafana/data';
import { ProfileSchema } from '@shared/pyroscope-api/google/v1/profile_pb';
import {
  ProfileFormat,
  SelectMergeStacktracesRequestSchema,
  SelectMergeStacktracesResponseSchema,
} from '@shared/pyroscope-api/querier/v1/querier_pb';

import { PprofApiClient } from '../PprofApiClient';

jest.mock('@grafana/runtime', () => ({ config: { bootData: { user: { orgId: 1 } } } }));

const timeRange = { from: dateTime(1710352800123), to: dateTime(1710352801124), raw: { from: '1', to: '2' } };
const query = 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="api"}';

const runtime = globalThis as unknown as { fetch: jest.Mock };

function responseBytes(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('PprofApiClient', () => {
  const client = new PprofApiClient({ dataSourceUid: 'pyroscope' });

  it('requests pprof bytes from SelectMergeStacktraces with both selectors', async () => {
    const profile = create(ProfileSchema, { stringTable: ['', 'main'] });
    const payload = toBinary(
      SelectMergeStacktracesResponseSchema,
      create(SelectMergeStacktracesResponseSchema, { pprof: { profile } })
    );
    runtime.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => responseBytes(payload),
    }));

    const blob = await client.selectMergeProfile({
      query,
      timeRange,
      maxNodes: 10,
      profileIdSelector: 'profile-1',
      spanSelector: 'span-1',
    });

    const [url, init] = runtime.fetch.mock.calls[0] as [string, RequestInit];
    const request = fromBinary(SelectMergeStacktracesRequestSchema, init.body as Uint8Array);

    expect(url).toContain('/SelectMergeStacktraces');
    expect(init.headers).toMatchObject({ 'content-type': 'application/proto' });
    expect(request.format).toBe(ProfileFormat.PPROF);
    expect(request.start).toBe(BigInt(1710352800123));
    expect(request.end).toBe(BigInt(1710352801124));
    expect(request.profileIdSelector).toEqual(['profile-1']);
    expect(request.spanSelector).toEqual(['span-1']);
    expect(await readBlob(blob)).toEqual(toBinary(ProfileSchema, profile));
  });

  it('rejects a response that does not include a pprof profile', async () => {
    const payload = toBinary(SelectMergeStacktracesResponseSchema, create(SelectMergeStacktracesResponseSchema, {}));
    runtime.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => responseBytes(payload),
    }));

    await expect(client.selectMergeProfile({ query, timeRange, maxNodes: 10, spanSelector: 'span-1' })).rejects.toThrow(
      'PROFILE_FORMAT_PPROF'
    );
  });
});

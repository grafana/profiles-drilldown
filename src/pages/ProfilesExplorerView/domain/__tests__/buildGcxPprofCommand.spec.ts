import { dateTimeParse } from '@grafana/data';

import { buildGcxPprofCommand } from '../buildGcxPprofCommand';

describe('buildGcxPprofCommand', () => {
  it('builds a pprof command with the datasource, selector, exact range, and filename', () => {
    const command = buildGcxPprofCommand({
      dataSourceUid: 'pyroscope uid',
      query: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="api",env="prod"}',
      timeRange: {
        raw: { from: 'now-1h', to: 'now' },
        from: dateTimeParse('2024-02-18T23:00:00.123Z'),
        to: dateTimeParse('2024-02-19T00:00:00.456Z'),
      },
      maxNodes: 5000,
      filename: 'api_process_cpu.pb.gz',
      profileIds: ['550e8400-e29b-41d4-a716-446655440000', '7c9e6679-7425-40de-944b-e07fc1f90ae7'],
      spanIds: ['00f067aa0ba902b7', '01f067aa0ba902b8'],
    });

    expect(command).toBe(
      "gcx profiles query -d 'pyroscope uid' '{service_name=\"api\",env=\"prod\"}' --profile-type 'process_cpu:cpu:nanoseconds:cpu:nanoseconds' --from '2024-02-18T23:00:00.123Z' --to '2024-02-19T00:00:00.456Z' --max-nodes 5000 --profile-id '550e8400-e29b-41d4-a716-446655440000' --profile-id '7c9e6679-7425-40de-944b-e07fc1f90ae7' --span-id '00f067aa0ba902b7' --span-id '01f067aa0ba902b8' -o pprof --pprof-path 'api_process_cpu.pb.gz'"
    );
  });

  it('shell-quotes generated arguments', () => {
    const command = buildGcxPprofCommand({
      dataSourceUid: "pyro'scope",
      query: 'process_cpu{service_name="api"}',
      timeRange: {
        raw: { from: '1', to: '2' },
        from: dateTimeParse(1000),
        to: dateTimeParse(2000),
      },
      maxNodes: 1,
      filename: "profile's.pb.gz",
    });

    expect(command).toContain(`-d 'pyro'\"'\"'scope'`);
    expect(command).toContain(`--pprof-path 'profile'\"'\"'s.pb.gz'`);
  });
});

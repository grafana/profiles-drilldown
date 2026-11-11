import { dateTimeParse } from '@grafana/data';

import { getExportFilename } from '../getExportFilename';

describe('getFileName(query, timeRange)', () => {
  it('computes the correct filename', () => {
    // 2024-02-18 - 2024-02-19
    const timeRange = {
      raw: {
        from: '1708210800',
        to: '1708297200',
      },
      from: dateTimeParse(1708210800000),
      to: dateTimeParse(1708297200000),
    };

    const filename = getExportFilename(
      'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="alerting-ops/grafana",}',
      timeRange
    );

    expect(filename).toBe(
      'alerting-ops-grafana_process_cpu:cpu:nanoseconds:cpu:nanoseconds_2024-02-17_2300-to-2024-02-18_2300'
    );
  });
});

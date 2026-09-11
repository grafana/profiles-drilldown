import { buildSpanTimeRange } from '../domain/buildSpanTimeRange';

describe('buildSpanTimeRange', () => {
  it('builds a tight 1ms range from the selected exemplar timestamp', () => {
    expect(buildSpanTimeRange(1_700_000_000_000)).toEqual({
      from: '2023-11-14T22:13:20.000Z',
      to: '2023-11-14T22:13:20.001Z',
    });
  });

  it('changes when the same span ID is selected at a different timestamp', () => {
    expect(buildSpanTimeRange(1_700_000_000_000)).not.toEqual(buildSpanTimeRange(1_700_000_000_001));
  });
});

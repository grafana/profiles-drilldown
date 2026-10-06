import { DataFrameDTO, toDataFrame } from '@grafana/data';
import { data as SAMPLE_FLAME_GRAPH_DATA_FRAME_DTO } from '@grafana/flamegraph';

export const SAMPLE_FLAME_GRAPH_DATA = toDataFrame(SAMPLE_FLAME_GRAPH_DATA_FRAME_DTO);

// Clamping each node's scale factor to its parent's preserves value(child) <= value(parent), so scaled children never overflow their parent bar.
// The root gets a fixed factor (rather than its own raw one) so it doesn't become a low ceiling for the whole tree.
function computeContainmentSafeFactors(
  levels: number[],
  rootFactor: number,
  rawFactorOf: (index: number) => number
): number[] {
  const lastIndexAtLevel: number[] = [];
  const factors = new Array<number>(levels.length);

  for (let index = 0; index < levels.length; index++) {
    const level = levels[index];
    const parentIndex = level > 0 ? lastIndexAtLevel[level - 1] : -1;

    factors[index] = parentIndex === -1 ? rootFactor : Math.min(rawFactorOf(index), factors[parentIndex]);
    lastIndexAtLevel[level] = index;
  }

  return factors;
}

function buildSampleDiffFlameGraphDataFrameDTO(): DataFrameDTO {
  const dto = SAMPLE_FLAME_GRAPH_DATA_FRAME_DTO;
  const levels = (dto.fields.find((field) => field.name === 'level')?.values ?? []) as number[];
  const values = (dto.fields.find((field) => field.name === 'value')?.values ?? []) as number[];
  const selfValues = (dto.fields.find((field) => field.name === 'self')?.values ?? []) as number[];

  const rawFactorOf = (index: number) => 0.4 + (((index * 37) % 100) / 100) * 1.4; // [0.4, 1.8)
  const factors = computeContainmentSafeFactors(levels, 1.4, rawFactorOf);
  const scale = (source: number[]) => source.map((value, index) => Math.round(value * factors[index]));

  return {
    ...dto,
    fields: [
      ...dto.fields,
      { name: 'valueRight', values: scale(values) },
      { name: 'selfRight', values: scale(selfValues) },
    ],
  };
}

export const SAMPLE_DIFF_FLAME_GRAPH_DATA = toDataFrame(buildSampleDiffFlameGraphDataFrameDTO());

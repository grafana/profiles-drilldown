export type Sample = {
  locationId: string[];
  value: string[];
};

type SampleType = {
  type: string;
  unit: string;
};

export type Function = {
  id: string;
  name: string;
  systemName: string;
  filename: string;
  startLine: string;
};

export type Location = {
  id: string;
  mappingId: string;
  line: Line[];
};

export type Line = {
  functionId: string;
  line: string;
};

export type Mapping = {
  id: string;
  buildId: string;
  filename?: string;
};

export type PprofProfile = {
  function: Function[];
  location: Location[];
  mapping: Mapping[];
  sample: Sample[];
  stringTable: string[];
  defaultSampleType: string;
  sampleType: SampleType[];
};

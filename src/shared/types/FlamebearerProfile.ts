type Flamebearer = {
  numTicks: number;
  maxSelf: number;
  names: string[];
  levels: number[][];
};

export type FlamebearerProfile = {
  version: number;
  flamebearer: Flamebearer;
  metadata: {
    appName?: string;
    endTime?: number;
    format: 'single' | 'double';
    maxNodes?: number;
    name?: string;
    query?: string;
    sampleRate: number;
    spyName:
      | '' // Query responses do not identify the profiler.
      | 'dotnetspy'
      | 'ebpfspy'
      | 'gospy'
      | 'phpspy'
      | 'pyspy'
      | 'rbspy'
      | 'nodespy'
      | 'javaspy'
      | 'pyroscope-rs'
      | 'scrape' // for compability purposes, it should be golang
      | 'tracing'
      | 'unknown';
    startTime?: number;
    units:
      | 'samples'
      | 'objects'
      | 'goroutines'
      | 'bytes'
      | 'lock_samples'
      | 'lock_nanoseconds'
      | 'trace_samples'
      | 'exceptions'
      | 'nanoseconds';
  };
  leftTicks?: number;
  rightTicks?: number;
};

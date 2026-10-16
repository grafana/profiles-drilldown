import { Function, Line, Location, Mapping, PprofProfile, Sample } from '@shared/types/PprofProfile';

import { PLACEHOLDER_COMMIT_DATA } from '../components/GitHubContextProvider/infrastructure/PrivateVcsClient';
import { CallSiteProps, FunctionDetails } from './types/FunctionDetails';

const buildDetails = (profile: PprofProfile, func: Function, mapping?: Mapping) => {
  let version;

  try {
    version = mapping ? JSON.parse(profile.stringTable[Number(mapping.buildId)]) : undefined;
  } catch {}

  return {
    name: profile.stringTable[Number(func.name)],
    version,
    startLine: !Number.isNaN(Number(func.startLine)) ? Number(func.startLine) : undefined,
    fileName: profile.stringTable[Number(func.filename)],
    executableName: mapping ? profile.stringTable[Number(mapping.filename)] : undefined,
    callSites: new Map<number, CallSiteProps>(),
    unit: profile.stringTable[Number(profile.sampleType[0].unit)],
    commit: PLACEHOLDER_COMMIT_DATA,
  };
};

// sums up the value for a particular callsite
function addCallSiteValue(details: FunctionDetails, line: Line, value: number, index: number): FunctionDetails {
  const lineNumber = Number(line.line);
  const callSite = details.callSites.get(lineNumber) || {
    line: Number(line.line),
    flat: 0,
    cum: 0,
  };

  // if the function we're interested in is at the leaf node (index=0), we have its flat value...
  const flat = index === 0 ? value : 0; // value of the location itself

  // ...if not, that's its cum value
  // locations above the leaf node don't contribute to the sample value (their self is 0)
  // this is what the API returns
  const cum = value; // value of the location plus all its descendants

  callSite.flat += flat;
  callSite.cum += cum;

  details.callSites.set(lineNumber, callSite);

  return details;
}

// This reimplements functionality simliar to the upstream project:
// https://github.com/google/pprof/blob/997b0b79cac0f8c2f2566c506212de67a6edc5ff/internal/report/source.go#L318
function convertSample(
  fnName: string,
  profile: PprofProfile,
  locations: Map<string, Location>,
  functions: Map<string, Function>,
  mappings: Map<string, Mapping>,
  sample: Sample,
  versions: Map<string, FunctionDetails>
) {
  const locationIdSet = new Set();

  sample.locationId.forEach((locationId, index) => {
    const location = locations.get(locationId);
    location?.line?.forEach((line) => {
      const func = functions.get(line.functionId);
      if (!func) {
        return;
      }

      if (profile.stringTable[Number(func.name)] !== fnName) {
        return;
      }

      // https://github.com/google/pprof/blob/main/doc/README.md#details
      if (locationIdSet.has(locationId)) {
        return;
      }

      locationIdSet.add(locationId);

      const details = versions.get(location.mappingId) || buildDetails(profile, func, mappings.get(location.mappingId));

      versions.set(location.mappingId, addCallSiteValue(details, line, Number(sample.value[0]), index));
    });
  });
}

export function convertPprofToFunctionDetails(fnName: string, profile: PprofProfile): FunctionDetails[] {
  const versions = new Map<string, FunctionDetails>();

  const locations = new Map(profile.location?.map((l) => [l.id, l]));
  const functions = new Map(profile.function?.map((f) => [f.id, f]));
  const mappings = new Map(profile.mapping?.map((m) => [m.id, m]));

  profile.sample
    // Sometimes a sample may not have a stack trace associated with it. This
    // may be a bug in the Pyroscope API or it may be an idiosyncrasy of the pprof format.
    // While it may cause some counting errors, let's skip these for now.
    ?.filter((sample) => sample.locationId !== undefined)
    .forEach((sample) => convertSample(fnName, profile, locations, functions, mappings, sample, versions));

  return Array.from(versions.values());
}

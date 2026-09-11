import type { FlamebearerProfile } from '@shared/types/FlamebearerProfile';

import { prepareAdHocProfileUploadPayload } from '../prepareAdHocProfileUploadPayload';

const doubleProfile = (): FlamebearerProfile => ({
  version: 1,
  leftTicks: 100,
  flamebearer: {
    numTicks: 100,
    maxSelf: 5,
    names: ['root'],
    levels: [[0, 100, 10, 0, 80, 8, 0]],
  },
  metadata: {
    format: 'double',
    sampleRate: 100,
    spyName: 'gospy',
    units: 'samples',
    name: 'diff',
  },
});

function utf8ToBase64(s: string): string {
  return btoa(s);
}

function parsePayload(base64: string): FlamebearerProfile {
  return JSON.parse(atob(base64)) as FlamebearerProfile;
}

describe('prepareAdHocProfileUploadPayload', () => {
  it('converts double profile to single', () => {
    const [payload, converted] = prepareAdHocProfileUploadPayload(utf8ToBase64(JSON.stringify(doubleProfile())));
    expect(converted).toBe(true);
    const parsed = parsePayload(payload);
    expect(parsed.metadata.format).toBe('single');
    expect(parsed.flamebearer.levels[0]).toEqual([0, 100, 10, 0]);
    expect(parsed.flamebearer.numTicks).toBe(100);
    expect(parsed.flamebearer.maxSelf).toBe(10);
  });

  it('returns input unchanged for non-JSON and single profiles', () => {
    const binary = btoa(String.fromCharCode(0xff, 0xfe, 0xfd));
    expect(prepareAdHocProfileUploadPayload(binary)).toEqual([binary, false]);

    const text = utf8ToBase64('not json');
    expect(prepareAdHocProfileUploadPayload(text)).toEqual([text, false]);

    const single = utf8ToBase64(
      JSON.stringify({
        version: 1,
        flamebearer: { numTicks: 10, maxSelf: 2, names: ['a'], levels: [[0, 10, 2, 0]] },
        metadata: { format: 'single', sampleRate: 1, spyName: 'gospy', units: 'samples', name: 'x' },
      })
    );
    expect(prepareAdHocProfileUploadPayload(single)).toEqual([single, false]);
  });

  it('throws when double level row length is invalid', () => {
    const p = doubleProfile();
    p.flamebearer.levels = [[0, 1, 2, 3]];
    expect(() => prepareAdHocProfileUploadPayload(utf8ToBase64(JSON.stringify(p)))).toThrow(/multiple of 7/);
  });
});

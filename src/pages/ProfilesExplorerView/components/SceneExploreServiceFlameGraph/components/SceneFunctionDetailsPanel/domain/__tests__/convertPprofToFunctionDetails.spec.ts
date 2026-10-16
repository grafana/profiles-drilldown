import { Location, PprofProfile } from '@shared/types/PprofProfile';

import { PLACEHOLDER_COMMIT_DATA } from '../../components/GitHubContextProvider/infrastructure/PrivateVcsClient';
import { convertPprofToFunctionDetails } from '../convertPprofToFunctionDetails';
import { CallSiteProps } from '../types/FunctionDetails';
import PprofData from './fixtures/pprof.json';
import YugePprofData from './fixtures/yuge.json';

jest.mock('@grafana/runtime', () => ({
  config: {
    appUrl: 'https://localhost:3000/',
    datasources: {
      'Test Data Source': {
        id: 1,
        isDefault: true,
        type: 'grafana-pyroscope-datasource',
        name: 'Test Data Source',
        jsonData: {},
      },
    },
  },
}));

function buildJsonPprof(fnName: string, location: Location[]): PprofProfile {
  return Object.freeze({
    location,
    function: [
      { id: '1', name: '3', systemName: '3', filename: '9', startLine: '6' },
      { id: '2', name: '4', systemName: '4', filename: '10', startLine: '37' },
      { id: '3', name: '11', systemName: '11', filename: '12', startLine: '1337' },
    ],
    mapping: [
      {
        id: '1',
        buildId: '1',
        filename: '9',
      },
      {
        id: '2',
        buildId: '2',
        filename: '10',
      },
    ],
    sample: [
      {
        locationId: ['1', '10'],
        value: ['140000000'],
      },
      {
        locationId: ['2', '20'],
        value: ['70000000'],
      },
      {
        locationId: ['2', '30'],
        value: ['35000000'],
      },
      {
        locationId: ['3', '10'],
        value: ['35000000'],
      },
      {
        locationId: ['4', '40'],
        value: ['1800000'],
      },
      {
        locationId: ['4', '50'],
        value: ['2600000'],
      },
      {
        locationId: ['5', '4'],
        value: ['90000'],
      },
      {
        locationId: ['6', '4'],
        value: ['120000'],
      },
      {
        locationId: ['7', '60', '8', '7'],
        value: ['65000'],
      },
      {
        locationId: ['60', '8', '7', '8'],
        value: ['21000'],
      },
    ],
    sampleType: [
      {
        type: '8',
        unit: '7',
      },
    ],
    stringTable: [
      '',
      '{"repository":"github.com/grafana/pyroscope","git_ref":"main"}',
      '{"repository":"github.com/grafana/pyroscope","git_ref":"bbb5f55"}',
      fnName,
      'github.com/grafana/pyroscope/pkg/util.(*Log).Wrap.Log.Wrap.func1',
      '',
      '',
      'nanoseconds',
      'cpu',
      '/opt/homebrew/Cellar/go/1.21.1/libexec/src/net/http/server.go',
      '/pyroscope/pkg/util/http.go',
      'iAmALittleInlinedFunction',
      '/little/func.go',
    ],
    defaultSampleType: '',
  }) as PprofProfile;
}

describe('convertPprofToFunctionDetails(fnName, profile)', () => {
  describe('when the profile does not contain any samples', () => {
    it('returns an empty array', () => {
      const result = convertPprofToFunctionDetails('testFn', {
        location: [],
        function: [],
        mapping: [],
        sample: [],
        stringTable: [],
        defaultSampleType: '',
        sampleType: [],
      });

      expect(result).toEqual([]);
    });
  });

  describe('when the profile contains samples', () => {
    it('returns function details: name, version, startLine, fileName, callSites, unit, commit', () => {
      const fnName = 'net/http.HandlerFunc.ServeHTTP';

      const result = convertPprofToFunctionDetails(
        fnName,
        buildJsonPprof(fnName, [{ id: '1', mappingId: '1', line: [{ functionId: '1', line: '42' }] }])
      );

      expect(result).toEqual([
        {
          name: fnName,
          version: {
            git_ref: 'main',
            repository: 'github.com/grafana/pyroscope',
          },
          startLine: 6,
          executableName: '/opt/homebrew/Cellar/go/1.21.1/libexec/src/net/http/server.go',
          fileName: '/opt/homebrew/Cellar/go/1.21.1/libexec/src/net/http/server.go',
          callSites: expect.any(Map),
          unit: 'nanoseconds',
          commit: PLACEHOLDER_COMMIT_DATA,
        },
      ]);
    });

    it('returns function details of function that has inlined another: name, version, startLine, fileName, callSites, unit, commit', () => {
      const fnName = 'net/http.HandlerFunc.ServeHTTP';

      const result = convertPprofToFunctionDetails(
        fnName,
        buildJsonPprof(fnName, [
          {
            id: '1',
            mappingId: '1',
            line: [
              { functionId: '3', line: '1339' },
              { functionId: '1', line: '42' },
            ],
          },
        ])
      );

      expect(result).toEqual([
        {
          name: fnName,
          version: {
            git_ref: 'main',
            repository: 'github.com/grafana/pyroscope',
          },
          startLine: 6,
          executableName: '/opt/homebrew/Cellar/go/1.21.1/libexec/src/net/http/server.go',
          fileName: '/opt/homebrew/Cellar/go/1.21.1/libexec/src/net/http/server.go',
          callSites: expect.any(Map),
          unit: 'nanoseconds',
          commit: PLACEHOLDER_COMMIT_DATA,
        },
      ]);
    });

    it('returns an array containing one element per mappingId (~commit)', () => {
      const fnName = 'net/http.HandlerFunc.ServeHTTP';

      const result = convertPprofToFunctionDetails(
        fnName,
        buildJsonPprof(fnName, [
          { id: '1', mappingId: '1', line: [{ functionId: '1', line: '42' }] },
          { id: '2', mappingId: '2', line: [{ functionId: '1', line: '58' }] },
        ])
      );

      expect(result).toHaveLength(2);

      expect(result[0]).toEqual(
        expect.objectContaining({
          name: fnName,
          version: {
            repository: 'github.com/grafana/pyroscope',
            git_ref: 'main',
          },
        })
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          name: fnName,
          version: {
            repository: 'github.com/grafana/pyroscope',
            git_ref: 'bbb5f55',
          },
        })
      );
    });

    describe('the "callSites" map, which associates a line number to "flat" and "cum" sample values', () => {
      describe('when the location is at a leaf node in the sample array', () => {
        it.each([
          [
            1,
            'net/http.HandlerFunc.ServeHTTP',
            [{ id: '1', mappingId: '1', line: [{ functionId: '1', line: '42' }] }],
            140000000,
          ],
          [
            2,
            'github.com/grafana/pyroscope/pkg/util.(*Log).Wrap.Log.Wrap.func1',
            [{ id: '2', mappingId: '1', line: [{ functionId: '2', line: '58' }] }],
            105000000,
          ],
        ])(`sums the "flat" and "cum" values #%d`, (index, fnName, location, expectedValue) => {
          const result = convertPprofToFunctionDetails(fnName, buildJsonPprof(fnName, location));

          const line = Number(location[0].line[0].line);

          expect(result[0].callSites).toEqual(
            new Map([
              [
                line,
                {
                  line,
                  flat: expectedValue,
                  cum: expectedValue,
                },
              ],
            ])
          );
        });
      });

      describe('when the location is not at a leaf node in the sample array', () => {
        it('sums only the "cum" values', () => {
          const fnName = 'net/http.(*conn).serve';
          const result = convertPprofToFunctionDetails(
            fnName,
            buildJsonPprof(fnName, [{ id: '10', mappingId: '2', line: [{ functionId: '1', line: '42' }] }])
          );

          expect(result[0].callSites).toEqual(
            new Map([
              [
                42,
                {
                  line: 42,
                  flat: 0,
                  cum: 175000000,
                },
              ],
            ])
          );
        });
      });

      describe('when the location is both at a leaf node and above in the sample array', () => {
        it('sums both "flat" and "cum" values', () => {
          const fnName = 'net/http.(*conn).serve';
          const result = convertPprofToFunctionDetails(
            fnName,
            buildJsonPprof(fnName, [{ id: '4', mappingId: '1', line: [{ functionId: '1', line: '42' }] }])
          );

          expect(result[0].callSites).toEqual(
            new Map([
              [
                42,
                {
                  line: 42,
                  flat: 4400000,
                  cum: 4610000,
                },
              ],
            ])
          );
        });
      });
    });

    describe('when the location appears several times in the sample array (recursive functions)', () => {
      it.each([
        [
          1,
          'net/http.HandlerFunc.ServeHTTP',
          [{ id: '7', mappingId: '2', line: [{ functionId: '1', line: '42' }] }],
          65000,
          86000,
        ],
        [
          2,
          'github.com/grafana/pyroscope/pkg/util.(*Log).Wrap.Log.Wrap.func1',
          [{ id: '8', mappingId: '2', line: [{ functionId: '2', line: '58' }] }],
          0,
          86000,
        ],
      ])(
        `sums computes only once the "flat" and "cum" values #%d`,
        (index, fnName, location, expectedFlat, expectedCum) => {
          const result = convertPprofToFunctionDetails(fnName, buildJsonPprof(fnName, location));

          const line = Number(location[0].line[0].line);

          expect(result[0].callSites).toEqual(
            new Map([
              [
                line,
                {
                  line,
                  flat: expectedFlat,
                  cum: expectedCum,
                },
              ],
            ])
          );
        }
      );
    });

    describe('when location or line data is missing', () => {
      it('skips samples with missing location', () => {
        const fnName = 'net/http.HandlerFunc.ServeHTTP';
        // Location '1' references locationId '1' which exists, but sample also references '999' which doesn't
        const profile = buildJsonPprof(fnName, [{ id: '1', mappingId: '1', line: [{ functionId: '1', line: '42' }] }]);
        // Add a sample referencing a non-existent location
        const modifiedProfile = {
          ...profile,
          sample: [...profile.sample, { locationId: ['999'], value: ['100000'] }],
        };

        const result = convertPprofToFunctionDetails(fnName, modifiedProfile);

        // Should still return results from valid location, ignoring the missing one
        expect(result).toHaveLength(1);
        expect(result[0].callSites.get(42)).toBeDefined();
      });

      it('skips locations with undefined line array', () => {
        const fnName = 'net/http.HandlerFunc.ServeHTTP';
        const result = convertPprofToFunctionDetails(
          fnName,
          buildJsonPprof(fnName, [
            { id: '1', mappingId: '1', line: undefined as any },
            { id: '2', mappingId: '1', line: [{ functionId: '1', line: '42' }] },
          ])
        );

        expect(result).toHaveLength(1);
        expect(result[0].callSites.get(42)).toBeDefined();
      });
    });

    describe('sample data tests', () => {
      it('pprof data - "runtime.netpoll"', () => {
        const funcName = 'runtime.netpoll';
        const result = convertPprofToFunctionDetails(funcName, PprofData);

        expect(result).toEqual([
          {
            name: 'runtime.netpoll',
            version: {
              repository: 'github.com/grafana/pyroscope',
              git_ref: 'main',
            },
            startLine: 121,
            fileName: '/usr/local/Cellar/go/1.21.3/libexec/src/runtime/netpoll_kqueue.go',
            callSites: new Map<number, CallSiteProps>([
              [168, { line: 168, cum: 140000000, flat: 0 }],
              [121, { line: 121, cum: 10000000, flat: 10000000 }],
              [141, { line: 141, cum: 4520000000, flat: 0 }],
              [126, { line: 126, cum: 10000000, flat: 10000000 }],
            ]),
            unit: 'nanoseconds',
            commit: {
              URL: '',
              author: {
                avatarURL: '',
                login: 'unknown author',
              },
              date: undefined,
              message: '',
              sha: '<unknown>',
            },
          },
        ]);
      });

      it('pprof data - "runtime.kevent"', () => {
        const result = convertPprofToFunctionDetails('runtime.kevent', PprofData);

        expect(result).toEqual([
          {
            name: 'runtime.kevent',
            version: {
              git_ref: 'main',
              repository: 'github.com/grafana/pyroscope',
            },
            startLine: 457,
            fileName: '/usr/local/Cellar/go/1.21.3/libexec/src/runtime/sys_darwin.go',
            callSites: new Map<number, CallSiteProps>([[458, { cum: 4520000000, flat: 4520000000, line: 458 }]]),
            unit: 'nanoseconds',
            commit: {
              URL: '',
              author: {
                avatarURL: '',
                login: 'unknown author',
              },
              date: undefined,
              message: '',
              sha: '<unknown>',
            },
          },
        ]);
      });

      it('yuge pprof data', () => {
        const funcName = 'github.com/grafana/pyroscope/pkg/phlaredb/symdb.(*PartitionWriter).convertSamples';
        const result = convertPprofToFunctionDetails(funcName, YugePprofData as PprofProfile);

        expect(result).toEqual([
          {
            name: funcName,
            version: {
              repository: 'https://github.com/grafana/pyroscope',
              git_ref: '369ca83',
            },
            startLine: 107,
            executableName: '/usr/bin/pyroscope',
            fileName: '/home/runner/work/pyroscope/pyroscope/pkg/phlaredb/symdb/dedup_slice.go',
            callSites: new Map<number, CallSiteProps>([
              [138, { cum: 27030000000, flat: 1490000000, line: 138 }],
              [143, { cum: 30700000000, flat: 0, line: 143 }],
              [152, { cum: 10500000000, flat: 0, line: 152 }],
              [136, { cum: 3560000000, flat: 400000000, line: 136 }],
              [151, { cum: 500000000, flat: 0, line: 151 }],
              [134, { cum: 1650000000, flat: 1650000000, line: 134 }],
              [120, { cum: 560000000, flat: 0, line: 120 }],
              [137, { cum: 820000000, flat: 820000000, line: 137 }],
              [142, { cum: 430000000, flat: 10000000, line: 142 }],
              [149, { cum: 70000000, flat: 70000000, line: 149 }],
              [132, { cum: 340000000, flat: 340000000, line: 132 }],
              [121, { cum: 370000000, flat: 0, line: 121 }],
              [127, { cum: 60000000, flat: 60000000, line: 127 }],
              [115, { cum: 660000000, flat: 0, line: 115 }],
              [156, { cum: 30000000, flat: 0, line: 156 }],
              [114, { cum: 420000000, flat: 150000000, line: 114 }],
              [130, { cum: 140000000, flat: 140000000, line: 130 }],
              [148, { cum: 130000000, flat: 130000000, line: 148 }],
              [133, { cum: 100000000, flat: 100000000, line: 133 }],
              [153, { cum: 30000000, flat: 30000000, line: 153 }],
              [147, { cum: 20000000, flat: 20000000, line: 147 }],
            ]),
            unit: 'nanoseconds',
            commit: {
              URL: '',
              author: {
                avatarURL: '',
                login: 'unknown author',
              },
              date: undefined,
              message: '',
              sha: '<unknown>',
            },
          },
        ]);
      });
    });
  });
});

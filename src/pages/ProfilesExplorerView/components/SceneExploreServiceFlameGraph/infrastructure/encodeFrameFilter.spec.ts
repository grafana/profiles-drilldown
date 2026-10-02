import { Reader, Writer } from 'protobufjs/light';

import { appendFrameFilterToPprofRequest } from './encodeFrameFilter';

describe('encodeFrameFilter', () => {
  it('encodes all four frame filter conditions in a stack trace selector', () => {
    const bytes = appendFrameFilterToPprofRequest(Writer.create(), {
      includeFunctionNames: ['main.work'],
      excludeFunctionNames: ['main.idle'],
      includeFunctionNameRegexes: ['^main\\.'],
      excludeFunctionNameRegexes: ['sleep$'],
    }).finish();
    const request = Reader.create(bytes);
    expect(request.uint32() >>> 3).toBe(6);
    const selector = Reader.create(request.bytes());
    const selectorTag = selector.uint32();
    expect(selectorTag >>> 3).toBe(3);
    const filter = Reader.create(selector.bytes());
    const fields: Array<[number, string]> = [];
    while (filter.pos < filter.len) {
      const tag = filter.uint32();
      fields.push([tag >>> 3, filter.string()]);
    }
    expect(fields).toEqual([
      [1, 'main.work'],
      [2, 'main.idle'],
      [3, '^main\\.'],
      [4, 'sleep$'],
    ]);
  });
});

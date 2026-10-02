import { Writer } from 'protobufjs/light';

import { StackFrameFilter } from '../../../domain/StackFrameFilter';

export function encodeFrameFilter(frameFilter: StackFrameFilter): Uint8Array {
  const filter = Writer.create();
  const fields: Array<keyof StackFrameFilter> = [
    'includeFunctionNames',
    'excludeFunctionNames',
    'includeFunctionNameRegexes',
    'excludeFunctionNameRegexes',
  ];
  fields.forEach((key, index) =>
    frameFilter[key].forEach((name) => filter.uint32(((index + 1) << 3) | 2).string(name))
  );
  return Writer.create().uint32(26).bytes(filter.finish()).finish();
}

export function appendFrameFilterToPprofRequest(request: Writer, frameFilter: StackFrameFilter): Writer {
  return request.uint32(50).bytes(encodeFrameFilter(frameFilter));
}

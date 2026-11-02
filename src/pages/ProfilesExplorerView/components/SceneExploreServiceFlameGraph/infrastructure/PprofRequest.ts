import { Writer } from 'protobufjs/light';

function writeString(writer: Writer, fieldNumber: number, value: string) {
  writer.uint32((fieldNumber << 3) | 2).string(value);
}

function writeVarint(writer: Writer, fieldNumber: number, value: number) {
  writer.uint32((fieldNumber << 3) | 0).int64(value);
}

export function encodePprofRequest(
  profileTypeId: string,
  labelSelector: string,
  start: number,
  end: number,
  maxNodes: number,
  profileIdSelector: string[] = []
): Uint8Array {
  const writer = Writer.create();

  if (profileTypeId) {
    writeString(writer, 1, profileTypeId);
  }
  if (labelSelector) {
    writeString(writer, 2, labelSelector);
  }
  if (start) {
    writeVarint(writer, 3, start);
  }
  if (end) {
    writeVarint(writer, 4, end);
  }
  if (maxNodes) {
    writeVarint(writer, 5, maxNodes);
  }

  for (const profileId of profileIdSelector) {
    if (profileId) {
      writeString(writer, 7, profileId);
    }
  }

  return writer.finish();
}

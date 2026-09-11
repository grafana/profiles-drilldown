import type { FlamebearerProfile } from '@shared/types/FlamebearerProfile';

// Layout matches getNodes() in flamebearerToDataFrameDTO (diff: 7 values/node, single: 4).
const DOUBLE_CHUNK = 7;
const SINGLE_CHUNK = 4;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isDoubleFlamebearerProfile(v: unknown): v is FlamebearerProfile {
  if (!isRecord(v)) {
    return false;
  }
  const md = v.metadata;
  const fb = v.flamebearer;
  if (!isRecord(md) || !isRecord(fb)) {
    return false;
  }
  return md.format != null && String(md.format).toLowerCase() === 'double' && Array.isArray(fb.levels);
}

function convertDoubleProfileToSingle(profile: FlamebearerProfile): FlamebearerProfile {
  const { leftTicks, flamebearer, metadata, version } = profile;

  const newLevels = flamebearer.levels.map((row, rowIndex) => {
    if (row.length % DOUBLE_CHUNK !== 0) {
      throw new Error(
        `Invalid diff profile: row ${rowIndex} length ${row.length} is not a multiple of ${DOUBLE_CHUNK}.`
      );
    }
    const out: number[] = [];
    for (let i = 0; i < row.length; i += DOUBLE_CHUNK) {
      out.push(row[i]!, row[i + 1]!, row[i + 2]!, row[i + 6]!);
    }
    return out;
  });

  let maxSelf = 0;
  for (const row of newLevels) {
    for (let i = 0; i < row.length; i += SINGLE_CHUNK) {
      maxSelf = Math.max(maxSelf, row[i + 2]!);
    }
  }

  const numTicks = typeof leftTicks === 'number' ? leftTicks : flamebearer.numTicks;

  return {
    version,
    flamebearer: {
      ...flamebearer,
      levels: newLevels,
      numTicks,
      maxSelf,
    },
    metadata: {
      ...metadata,
      format: 'single',
    },
  };
}

function maybeRewriteDoubleFormatJson(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  if (!isDoubleFlamebearerProfile(parsed)) {
    return text;
  }

  return JSON.stringify(convertDoubleProfileToSingle(parsed));
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

function looksLikeJson(base64Payload: string): boolean {
  try {
    const n = Math.min(base64Payload.length, 64);
    const text = atob(base64Payload.slice(0, n - (n % 4)));
    const trimmed = text.trimStart();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  } catch {
    return false;
  }
}

/** Returns `[base64Payload, convertedFromDouble]`. */
export function prepareAdHocProfileUploadPayload(base64Payload: string): [string, boolean] {
  if (!looksLikeJson(base64Payload)) {
    return [base64Payload, false];
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64Payload);
  } catch {
    return [base64Payload, false];
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return [base64Payload, false];
  }

  const jsonText = text.trimStart();
  if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
    return [base64Payload, false];
  }

  const normalized = maybeRewriteDoubleFormatJson(jsonText);
  if (normalized === jsonText) {
    return [base64Payload, false];
  }

  return [bytesToBase64(new TextEncoder().encode(normalized)), true];
}

import { DataFrame, Field, FieldType } from '@grafana/data';

import { Evidence } from './jevRubric';

export type ExclusionReason = 'root' | 'truncated' | 'opaque' | 'zero_self';

export interface SemanticOccurrence {
  /** Index of the original DataFrame row. */
  readonly row: number;
  /** Call-path identity; unlike `row`, it does not change when unrelated stacks are added or reordered. */
  readonly id: string;
  readonly level: number;
  /** Full original label; `evidence.target` may be truncated. */
  readonly label: string;
  readonly self: number;
  readonly total: number;
  readonly evidence: Evidence;
  readonly excluded?: ExclusionReason;
}

export interface SemanticProfile {
  /** Root value; equals the sum of every occurrence's self weight. */
  readonly total: number;
  /** One occurrence per DataFrame row, indexed by row. */
  readonly occurrences: readonly SemanticOccurrence[];
}

const MAX_ROWS = 100_000;
const MAX_LEVELS = 1024;
const MAX_SYMBOL_LENGTH = 512;
const CALLER_CONTEXT = 8;
const OPAQUE = /!0x[0-9a-f]+|^\[unknown\]$|^<anonymous>$|^V8::.*Frame$|^0x[0-9a-f]+$/i;
// Global lookups are slow in sandboxed realms such as jsdom, and fingerprint runs per character.
const { imul } = Math;

interface Columns {
  level: unknown[];
  label: (row: number) => string;
  value: unknown[];
  self: unknown[];
}

interface Row {
  row: number;
  level: number;
  label: string;
  value: number;
  self: number;
}

interface PathNode {
  occurrence: SemanticOccurrence;
  children: number;
  ordinals?: Map<string, number>;
}

/**
 * Normalizes a non-diff flame graph DataFrame (DFS rows with level, label, value and self fields) into exact
 * row occurrences with bounded classification evidence. Throws on any input whose self weights cannot be
 * accounted for exactly.
 */
export function normalizeFlameGraph(frame: DataFrame): SemanticProfile {
  const columns = readColumns(frame);
  if (frame.length > MAX_ROWS) {
    throw new Error('Flame graph has too many rows');
  }
  const occurrences: SemanticOccurrence[] = [];
  const path: PathNode[] = [];
  const ids = new Set<string>();
  for (let row = 0; row < frame.length; row++) {
    const occurrence = addRow(path, readRow(columns, row));
    if (ids.has(occurrence.id)) {
      throw new Error('Flame graph identity collision');
    }
    ids.add(occurrence.id);
    occurrences.push(occurrence);
  }
  closeUntil(path, 0);
  const total = occurrences[0]?.total ?? 0;
  if (occurrences.reduce((sum, o) => sum + o.self, 0) !== total) {
    throw new Error('Profile mass is not conserved');
  }
  return Object.freeze({ total, occurrences: Object.freeze(occurrences) });
}

function readColumns(frame: DataFrame): Columns {
  if (frame.fields.some((f) => f.name === 'selfRight' || f.name === 'valueRight')) {
    throw new Error('Diff flame graphs are not supported');
  }
  return {
    level: numberField(frame, 'level').values,
    label: labelReader(field(frame, 'label')),
    value: numberField(frame, 'value').values,
    self: numberField(frame, 'self').values,
  };
}

function field(frame: DataFrame, name: string): Field {
  const matches = frame.fields.filter((f) => f.name === name);
  if (matches.length === 0) {
    throw new Error(`Flame graph is missing the ${name} field`);
  }
  if (matches.length > 1) {
    throw new Error(`Flame graph has duplicate ${name} fields`);
  }
  if (matches[0].values.length !== frame.length) {
    throw new Error(`Flame graph field ${name} has the wrong length`);
  }
  return matches[0];
}

function numberField(frame: DataFrame, name: string): Field {
  const found = field(frame, name);
  if (found.type !== FieldType.number) {
    throw new Error(`Flame graph field ${name} has an unsupported type`);
  }
  return found;
}

function labelReader(labels: Field): (row: number) => string {
  const invalid = (row: number) => new Error(`Flame graph row ${row} has an invalid label`);
  if (labels.type === FieldType.string) {
    return (row) => {
      const label = labels.values[row];
      if (typeof label !== 'string') {
        throw invalid(row);
      }
      return label;
    };
  }
  const text: unknown = labels.config.type?.enum?.text;
  if (labels.type !== FieldType.enum || !Array.isArray(text)) {
    throw new Error('Flame graph field label has an unsupported type');
  }
  return (row) => {
    const index = labels.values[row];
    const label = Number.isSafeInteger(index) ? text[index] : undefined;
    if (typeof label !== 'string') {
      throw invalid(row);
    }
    return label;
  };
}

function readRow(columns: Columns, row: number): Row {
  const level = columns.level[row];
  if (typeof level !== 'number' || !Number.isSafeInteger(level) || level < 0 || level >= MAX_LEVELS) {
    throw new Error(`Flame graph row ${row} has an invalid level`);
  }
  const label = columns.label(row);
  const value = weight(columns.value, row, 'value');
  const self = weight(columns.self, row, 'self');
  if (self > value) {
    throw new Error(`Flame graph row ${row} has self above value`);
  }
  return { row, level, label, value, self };
}

function weight(values: unknown[], row: number, name: string): number {
  const value = values[row];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Flame graph row ${row} has an invalid ${name}`);
  }
  return value;
}

function addRow(path: PathNode[], row: Row): SemanticOccurrence {
  if ((row.level === 0) !== (row.row === 0) || (row.level === 0 && row.label !== 'total')) {
    throw new Error('Flame graph must start with a single total root');
  }
  if (row.level > path.length) {
    throw new Error(`Flame graph row ${row.row} skips a level`);
  }
  closeUntil(path, row.level);
  const parent = path[row.level - 1];
  if (parent) {
    addChild(parent, row.value);
  }
  const occurrence = createOccurrence(row, parent);
  path.push({ occurrence, children: 0 });
  return occurrence;
}

function closeUntil(path: PathNode[], level: number) {
  while (path.length > level) {
    const { occurrence, children } = path.pop()!;
    if (occurrence.self + children !== occurrence.total) {
      throw new Error('Profile mass is not conserved');
    }
  }
}

function addChild(parent: PathNode, value: number) {
  if (value > parent.occurrence.total - parent.occurrence.self - parent.children) {
    throw new Error('Profile mass is not conserved');
  }
  parent.children += value;
}

function createOccurrence(row: Row, parent: PathNode | undefined): SemanticOccurrence {
  const callers =
    parent && row.level > 1
      ? [...parent.occurrence.evidence.callers, parent.occurrence.evidence.target].slice(-CALLER_CONTEXT)
      : [];
  return Object.freeze({
    row: row.row,
    id: pathId(parent?.occurrence.id ?? '', nextOrdinal(parent, row.label), row.label),
    level: row.level,
    label: row.label,
    self: row.self,
    total: row.value,
    evidence: Object.freeze({ target: row.label.slice(0, MAX_SYMBOL_LENGTH), callers: Object.freeze(callers) }),
    excluded: exclusion(row),
  });
}

// Same-name siblings are not merged, so the ordinal keeps their identities distinct.
function nextOrdinal(parent: PathNode | undefined, label: string): number {
  if (!parent) {
    return 0;
  }
  parent.ordinals ??= new Map();
  const ordinal = parent.ordinals.get(label) ?? 0;
  parent.ordinals.set(label, ordinal + 1);
  return ordinal;
}

function exclusion(row: Row): ExclusionReason | undefined {
  if (row.level === 0) {
    return 'root';
  }
  if (row.label === 'other') {
    return 'truncated';
  }
  if (OPAQUE.test(row.label)) {
    return 'opaque';
  }
  return row.self === 0 ? 'zero_self' : undefined;
}

// Non-cryptographic 128-bit path fingerprint (two seeded cyrb53-style passes). Collisions are rejected by the
// caller rather than merged, so crafted symbols cannot misattribute weight.
function pathId(parent: string, ordinal: number, label: string): string {
  const key = `${parent}\u0000${ordinal}\u0000${label}`;
  return fingerprint(key, 0) + fingerprint(key, 1);
}

function fingerprint(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = imul(h1 ^ code, 2654435761);
    h2 = imul(h2 ^ code, 1597334677);
  }
  h1 = imul(h1 ^ (h1 >>> 16), 2246822507) ^ imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = imul(h2 ^ (h2 >>> 16), 2246822507) ^ imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

import { t } from '@grafana/i18n';

import { generateUUID } from '@shared/domain/generateUUID';
import { FilterKind, Filters, OperatorKind } from '../types';
import { buildIsEmptyFilter } from './buildIsEmptyFilter';

type TokenKind = 'name' | 'quoted' | 'op' | 'comma' | 'unknown';
type Token = { kind: TokenKind; value: string };

type LexResult = { token: Token; end: number };

function lexQuotedString(input: string, start: number): LexResult {
  let i = start + 1; // skip opening quote
  let s = '';
  while (i < input.length && input[i] !== '"') {
    if (input[i] === '\\' && i + 1 < input.length) {
      s += input[i + 1];
      i += 2;
    } else {
      s += input[i++];
    }
  }
  return { token: { kind: 'quoted', value: s }, end: i + 1 }; // +1 for closing quote
}

function lexOperator(input: string, start: number): LexResult {
  let op = input[start];
  let i = start + 1;
  if (i < input.length && (input[i] === '=' || input[i] === '~')) {
    op += input[i++];
  }
  return { token: { kind: 'op', value: op }, end: i };
}

function lexWord(input: string, start: number, kind: TokenKind): LexResult {
  let word = '';
  let i = start;
  while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
    word += input[i++];
  }
  return { token: { kind, value: word }, end: i };
}

function lexToken(input: string, pos: number): LexResult {
  const ch = input[pos];

  if (ch === ',') {
    return { token: { kind: 'comma', value: ',' }, end: pos + 1 };
  }
  if (ch === '"') {
    return lexQuotedString(input, pos);
  }
  if (ch === '=' || ch === '!') {
    return lexOperator(input, pos);
  }
  if (/[a-zA-Z_]/.test(ch)) {
    return lexWord(input, pos, 'name');
  }
  if (/[0-9]/.test(ch)) {
    return lexWord(input, pos, 'unknown');
  }
  return { token: { kind: 'unknown', value: ch }, end: pos + 1 };
}

export function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] === ' ') {
      i++;
      continue;
    }
    const result = lexToken(input, i);
    tokens.push(result.token);
    i = result.end;
  }

  return tokens;
}

export const parseRawFilters = (rawFilters: string): string[][] => {
  const tokens = lex(rawFilters);
  const results: string[][] = [];
  let i = 0;

  while (i < tokens.length) {
    while (i < tokens.length && tokens[i].kind === 'comma') {
      i++;
    }

    const nameToken = tokens[i];
    const opToken = tokens[i + 1];
    const valueToken = tokens[i + 2];

    if (
      (nameToken?.kind === 'name' || nameToken?.kind === 'quoted') &&
      opToken?.kind === 'op' &&
      valueToken?.kind === 'quoted'
    ) {
      results.push([nameToken.value, opToken.value, valueToken.value]);
      i += 3;
    } else {
      i++;
    }
  }

  return results;
};

const LABELS_REGEX = /.+:[^{]+\{(.+)\}$/;
const REGEX_CHARS_REGEX = /.*(\^|\$|\*|\+|\{|\}|\?).*/;

export function queryToFilters(query: string): Filters {
  // 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="ebpf/gcp-logs-ops/grafana-agent", namespace="gcp-logs-ops"}'
  if (!query) {
    return [];
  }

  const rawLabels = query.match(LABELS_REGEX);
  // [_, 'service_name="ebpf/gcp-logs-ops/grafana-agent", namespace="gcp-logs-ops"']
  if (!rawLabels) {
    return [];
  }

  const rawFilters = parseRawFilters(rawLabels[1]);

  // [[service_name, =, ebpf/gcp-logs-ops/grafana-agent], [namespace, =, gcp-logs-ops]]

  return (rawFilters as string[][])
    .filter(([attribute]) => attribute !== 'service_name')
    .map(([attribute, operator, value]) => {
      const filter = {
        id: generateUUID(),
        type: FilterKind['attribute-operator-value'],
        active: true,
        attribute: { value: attribute, label: attribute },
        operator: { value: operator, label: operator },
        value: { value: value, label: value },
      };

      const shouldConvertToIsEmptyOperator = operator === OperatorKind['='] && value === '';
      if (shouldConvertToIsEmptyOperator) {
        return buildIsEmptyFilter(filter);
      }

      const shouldConvertToInNotInOperator =
        [OperatorKind['=~'], OperatorKind['!~']].includes(operator as OperatorKind) && !REGEX_CHARS_REGEX.test(value);

      if (shouldConvertToInNotInOperator) {
        return {
          ...filter,
          operator:
            operator === OperatorKind['=~']
              ? { value: OperatorKind.in, label: t('query-builder.operators.in', 'in') }
              : { value: OperatorKind['not-in'], label: t('query-builder.operators.not-in', 'not in') },
          value: {
            value: value,
            label: value
              .split('|')
              .map((v) => v.trim())
              .join(', '),
          },
        };
      }

      return filter;
    });
}

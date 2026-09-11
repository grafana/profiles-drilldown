import { lex } from './queryToFilters';

/**
 * Returns the label name quoted in double-quotes if it contains characters
 * outside [a-zA-Z_][a-zA-Z0-9_]*, as required by the Pyroscope/PromQL UTF-8
 * label matcher syntax. Safe names are returned unchanged.
 *
 * Uses the shared lexer as the single source of truth for what constitutes
 * a valid unquoted label name.
 */
export function quoteLabelName(name: string): string {
  const tokens = lex(name);

  if (tokens.length === 1 && tokens[0].kind === 'name') {
    return name;
  }

  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Returns a PromQL-compatible double-quoted label value. */
export function quoteLabelValue(value: string): string {
  return JSON.stringify(value);
}

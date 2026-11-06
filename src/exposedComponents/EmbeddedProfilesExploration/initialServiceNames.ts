import { AdHocVariableFilter } from '@grafana/data';

const REGEX_METACHARACTERS = '.^$*+?()[]{}';
const ESCAPABLE_CHARACTERS = `\\${REGEX_METACHARACTERS}|`;

/** Decode only positive equality or regex lists made entirely of literal names. */
export function initialServiceNames(filters: AdHocVariableFilter[]): string[] {
  const filter = filters.find((filter) => filter.key === 'service_name');
  if (!filter || !filter.value) {
    return [];
  }
  if (filter.operator === '=') {
    return [filter.value];
  }
  return filter.operator === '=~' ? parseLiteralRegexAlternation(filter.value) : [];
}

function parseLiteralRegexAlternation(pattern: string): string[] {
  // Match raw unescaped tokens separated by unescaped pipes.
  const rawTokens = pattern.match(/(?:\\.|[^|])+/g);
  if (!rawTokens || rawTokens.join('|') !== pattern) {
    return [];
  }
  const decoded = rawTokens.map(decodeLiteralRegexToken);
  return decoded.every((token): token is string => token !== null) ? decoded : [];
}

function decodeLiteralRegexToken(token: string): string | null {
  let decoded = '';
  for (let i = 0; i < token.length; i++) {
    const character = token[i];
    if (character === '\\') {
      const escaped = token[++i];
      // Reject character classes and other regex escapes, such as \d or \w.
      if (!escaped || !ESCAPABLE_CHARACTERS.includes(escaped)) {
        return null;
      }
      decoded += escaped;
    } else if (REGEX_METACHARACTERS.includes(character)) {
      return null;
    } else {
      decoded += character;
    }
  }
  return decoded;
}

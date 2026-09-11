export const FILTER_EXPRESSION_WITH_LEADING_COMMA = 'filterExpressionWithLeadingComma';

export function filterExpressionWithLeadingComma(filterExpression?: string): string {
  return filterExpression ? `,${filterExpression}` : '';
}

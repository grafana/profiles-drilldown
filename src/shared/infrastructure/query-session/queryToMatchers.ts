export function queryToMatchers(query: string): string[] {
  const labelsIndex = query.indexOf('{');
  if (labelsIndex > 0) {
    const profileTypeID = query.substring(0, labelsIndex);
    return [`{__profile_type__="${profileTypeID}", ${query.substring(labelsIndex + 1)}`];
  }
  if (labelsIndex === 0) {
    return [query];
  }
  return [`{__profile_type__="${query}"}`];
}

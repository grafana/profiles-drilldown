export type StackFrameFilter = {
  includeFunctionNames: string[];
  excludeFunctionNames: string[];
  includeFunctionNameRegexes: string[];
  excludeFunctionNameRegexes: string[];
};

export const emptyStackFrameFilter = (): StackFrameFilter => ({
  includeFunctionNames: [],
  excludeFunctionNames: [],
  includeFunctionNameRegexes: [],
  excludeFunctionNameRegexes: [],
});

export const hasStackFrameFilter = (filter: StackFrameFilter): boolean =>
  Object.values(filter).some((values) => values.length > 0);

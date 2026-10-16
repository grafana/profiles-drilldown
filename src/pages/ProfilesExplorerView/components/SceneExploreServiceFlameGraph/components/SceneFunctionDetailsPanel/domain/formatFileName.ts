// when using direction=rtl, the first / is ending up at the end of the string
// so we add a / at the end of the string to make it look better
export const formatFileName = (fileName: string): string => {
  if (!fileName) return fileName;
  const withoutKernel = fileName.startsWith('[kernel] ')
    ? fileName.slice('[kernel] '.length)
    : fileName;
  return withoutKernel[0] === '/' ? withoutKernel.substring(1) + '/' : withoutKernel;
};
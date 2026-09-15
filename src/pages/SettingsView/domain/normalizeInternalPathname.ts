export function normalizeInternalPathname(pathname: string): string {
  return `/${pathname.replaceAll('\\', '/').replace(/^\/+/, '')}`;
}

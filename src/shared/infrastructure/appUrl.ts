import { locationUtil } from '@grafana/data';

/**
 * Adds Grafana's configured subpath to relative paths without duplicating an existing prefix.
 *
 * @param path - A root-relative path, relative path, or absolute URL.
 * @returns The prefixed root-relative path, or the unchanged absolute or protocol-relative URL.
 */
export function getGrafanaUrl(path: string): string {
  if (URL.canParse(path) || path.startsWith('//')) {
    return path;
  }

  const base = locationUtil.assureBaseUrl('/').replace(/\/+$/, '');
  const pathname = path.startsWith('/') ? path : `/${path}`;
  const hasBase = pathname.startsWith(base) && /^([/?#]|$)/.test(pathname.slice(base.length));
  return hasBase ? pathname : `${base}${pathname}`;
}

/**
 * Resolves a URL against the browser's origin after applying Grafana's subpath handling.
 * Requires window.location.
 *
 * @param path - A root-relative path, relative path, or absolute URL.
 * @returns An absolute URL. Absolute input URLs retain their original origin.
 */
export function getGrafanaAbsoluteUrl(path: string): string {
  return new URL(getGrafanaUrl(path), window.location.origin).toString();
}

/**
 * Builds a Grafana datasource proxy URL.
 *
 * @param dataSourceUid - The UID of the datasource to proxy requests through.
 * @returns The root-relative proxy URL, including Grafana's configured subpath.
 */
export function getDataSourceProxyUrl(dataSourceUid: string): string {
  return getGrafanaUrl(`/api/datasources/proxy/uid/${dataSourceUid}`);
}

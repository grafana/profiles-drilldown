import { dateMath } from '@grafana/data';
import { logger } from '@shared/infrastructure/tracking/logger';

import { getDefaultTimeRange } from '../../../..//domain/buildTimeRange';

export function builsShareableUrl(): URL {
  const shareableUrl = new URL(window.location.toString());
  const { searchParams } = shareableUrl;

  if (!searchParams.get('from')) {
    searchParams.set('from', getDefaultTimeRange().from);
  }
  if (!searchParams.get('to')) {
    searchParams.set('to', getDefaultTimeRange().to);
  }

  ['from', 'to', 'from-2', 'to-2', 'from-3', 'to-3', 'diffFrom', 'diffTo', 'diffFrom-2', 'diffTo-2'].forEach((name) => {
    const value = searchParams.get(name);
    if (!value) {
      return;
    }

    const parsed = dateMath.toDateTime(value, {});
    if (parsed?.isValid()) {
      searchParams.set(name, String(parsed.valueOf()));
    }
  });

  return shareableUrl;
}

/**
 * ClipboardButton calls getText() outside its clipboard error handler.
 * Swallow build failures (and fall back to the current URL) so the click
 * handler does not throw. User-facing copy errors belong in onClipboardError
 * only — otherwise a failed build plus a failed clipboard write would toast twice.
 */
export function getShareableUrlText(): string {
  try {
    return builsShareableUrl().toString();
  } catch (error) {
    logger.error(error as Error, { handheldBy: 'getShareableUrlText' });
    return window.location.toString();
  }
}

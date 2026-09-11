import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { IconButton, useStyles2 } from '@grafana/ui';
import React, { useCallback, useState } from 'react';

export function CopyableId({ value, display, onOpen }: { value: string; display: string; onOpen?: () => void }) {
  const [copied, setCopied] = useState(false);
  const styles = useStyles2(getStyles);

  const handleCopy = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [value]
  );

  return (
    <span className={styles.wrapper} title={value}>
      {onOpen ? (
        <button
          type="button"
          className={styles.link}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          {display}
        </button>
      ) : (
        <span className={styles.text}>{display}</span>
      )}
      <IconButton
        name={copied ? 'check' : 'clipboard-alt'}
        tooltip={
          copied
            ? t('heatmap.exemplar-table.copied', 'Copied!')
            : t('heatmap.exemplar-table.copy-to-clipboard', 'Copy to clipboard')
        }
        size="xs"
        className={copied ? styles.iconCopied : styles.icon}
        onClick={handleCopy}
      />
    </span>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: inline-flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(0, 0.25)};

    &:hover {
      background: ${theme.colors.action.hover};
    }
  `,
  text: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  link: css`
    appearance: none;
    border: 0;
    background: none;
    color: ${theme.colors.text.link};
    cursor: pointer;
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: ${theme.typography.bodySmall.fontSize};
    padding: 0;

    &:hover {
      text-decoration: underline;
    }
  `,
  icon: css`
    color: ${theme.colors.text.secondary};
    opacity: 0;

    span:hover & {
      opacity: 1;
    }
  `,
  iconCopied: css`
    color: ${theme.colors.success.text};
  `,
});

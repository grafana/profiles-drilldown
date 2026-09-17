import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { ToolbarButton, useStyles2 } from '@grafana/ui';
import React from 'react';

interface Props {
  message?: string;
  onClick?: (e: React.SyntheticEvent) => void;
  ariaLabel?: string;
}

export function PanelStatus({ message, onClick, ariaLabel = 'status' }: Props) {
  const styles = useStyles2(getStyles);

  return (
    <ToolbarButton
      className={styles.buttonStyles}
      onClick={onClick}
      variant={'destructive'}
      icon="exclamation-triangle"
      iconSize="md"
      tooltip={message || ''}
      aria-label={ariaLabel}
    />
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  const { headerHeight, padding } = theme.components.panel;

  return {
    buttonStyles: css({
      label: 'panel-header-state-button',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing(padding),
      width: theme.spacing(headerHeight),
      height: theme.spacing(headerHeight),
      borderRadius: theme.shape.radius.sm || theme.shape.radius.default,
    }),
  };
};

import { css } from '@emotion/css';
import { GrafanaTheme2, LoadingState } from '@grafana/data';
import { Icon, Tooltip, useStyles2 } from '@grafana/ui';
import React, { ReactElement, ReactNode } from 'react';

import { GrafanaPanelBox } from './GrafanaPanelBox/GrafanaPanelBox';

const getStyles = (theme: GrafanaTheme2) => ({
  panelWrap: css`
    margin-bottom: ${theme.spacing(1)};
  `,
  description: css`
    color: ${theme.colors.text.secondary};
    display: flex;
    align-items: center;
  `,
});

type PanelProps = {
  isLoading: boolean;
  title?: ReactNode;
  description?: string | ReactElement;
  children: ReactNode;
  className?: string;
  headerActions?: ReactNode;
  menu?: ReactElement | (() => ReactElement);
  dataTestId?: string;
};

export function Panel({
  isLoading,
  title,
  description,
  children,
  className = '',
  headerActions,
  menu,
  dataTestId,
}: PanelProps) {
  const s = useStyles2(getStyles);

  const loadingState = isLoading ? LoadingState.Loading : LoadingState.Done;

  return (
    <div className={`${className} ${s.panelWrap}`} data-testid={dataTestId || 'panel'}>
      <GrafanaPanelBox
        loadingState={loadingState}
        title={title as unknown as string}
        titleItems={description ? <PanelDescription description={description} /> : undefined}
        actions={headerActions}
        menu={menu}
      >
        {children}
      </GrafanaPanelBox>
    </div>
  );
}

function PanelDescription({ description }: { description: string | ReactElement }) {
  const s = useStyles2(getStyles);

  return (
    <Tooltip content={description}>
      <span className={s.description}>
        <Icon name="info-circle" />
      </span>
    </Tooltip>
  );
}

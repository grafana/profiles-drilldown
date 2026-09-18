import { css, cx } from '@emotion/css';
import { GrafanaTheme2, LoadingState } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import { Icon, LoadingBar, Tooltip, useStyles2, useTheme2 } from '@grafana/ui';
import React, { CSSProperties, ReactElement, ReactNode, useEffect, useRef, useState } from 'react';

import { DelayRender } from './DelayRender';
import { HoverWidget } from './HoverWidget';
import { PanelMenu } from './PanelMenu';
import { PanelStatus } from './PanelStatus';
import { TitleItem } from './TitleItem';

// This `GrafanaPanelBox` has been derived from the `PanelChrome`, which is exportable via @grafana/ui
// This variant makes it behave more like the panel/box from Pyroscope, where css dictates the style
// versus explicit height & width props.
// The various files in this subdirectory are lifted from grafana/grafana, but this base component, `PanelChromeProps`
// has been altered slightly.
//
// TODO Consider creating a varation of this component that can be exported from @grafana/ui.

/**
 * @internal
 */
interface PanelChromeProps {
  children: ReactNode;
  padding?: PanelPadding;
  hoverHeaderOffset?: number;
  title?: string;
  titleItems?: ReactNode;
  menu?: ReactElement | (() => ReactElement);
  dragClass?: string;
  dragClassCancel?: string;
  hoverHeader?: boolean;
  /**
   * Use only to indicate loading or streaming data in the panel.
   * Any other values of loadingState are ignored.
   */
  loadingState?: LoadingState;
  /**
   * Used to display status message (used for panel errors currently)
   */
  statusMessage?: string;
  /**
   * Handle opening error details view (like inspect / error tab)
   */
  statusMessageOnClick?: (e: React.SyntheticEvent) => void;
  actions?: ReactNode;
  displayMode?: 'default' | 'transparent';
  onCancelQuery?: () => void;
  /**
   * callback when opening the panel menu
   */
  onOpenMenu?: () => void;
}

/**
 * @internal
 */
type PanelPadding = 'none' | 'md';

/**
 * @internal
 */
export function GrafanaPanelBox({
  children,
  padding = 'md',
  title = '',
  displayMode = 'default',
  titleItems,
  menu,
  dragClass,
  dragClassCancel,
  hoverHeader = false,
  hoverHeaderOffset,
  loadingState,
  statusMessage,
  statusMessageOnClick,
  actions,
  onCancelQuery,
  onOpenMenu,
}: PanelChromeProps) {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);

  const [width, setWidth] = useState(0);
  const childrenContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (childrenContainerRef.current) {
      setWidth(childrenContainerRef.current.offsetWidth);
    }
  }, [childrenContainerRef]);

  const hasHeader = !hoverHeader;

  // hover menu is only shown on hover when not on touch devices
  const showOnHoverClass = 'show-on-hover';

  const headerHeight = getHeaderHeight(theme, hasHeader);
  const { contentStyle } = getContentStyle(padding, theme);

  const headerStyles: CSSProperties = {
    height: headerHeight,
    cursor: dragClass ? 'move' : 'auto',
  };

  const containerStyles: CSSProperties = {};
  if (displayMode === 'transparent') {
    containerStyles.backgroundColor = 'transparent';
    containerStyles.border = 'none';
  }

  const testid = title ? selectors.components.Panels.Panel.title(title) : 'Panel';

  const headerContent = (
    <>
      {title && (
        <h6 title={title} className={styles.title}>
          {title}
        </h6>
      )}

      <div className={cx(styles.titleItems, dragClassCancel)} data-testid="title-items-container">
        {titleItems}
      </div>

      {loadingState === LoadingState.Streaming && (
        <Tooltip
          content={
            onCancelQuery ? t('panel-box.stop-streaming', 'Stop streaming') : t('panel-box.streaming', 'Streaming')
          }
        >
          <TitleItem className={dragClassCancel} data-testid="panel-streaming" onClick={onCancelQuery}>
            <Icon name="circle-mono" size="md" className={styles.streaming} />
          </TitleItem>
        </Tooltip>
      )}
      {loadingState === LoadingState.Loading && onCancelQuery && (
        <DelayRender delay={2000}>
          <Tooltip content={t('panel-box.cancel-query', 'Cancel query')}>
            <TitleItem
              className={cx(dragClassCancel, styles.pointer)}
              data-testid="panel-cancel-query"
              onClick={onCancelQuery}
            >
              <Icon name="sync-slash" size="md" />
            </TitleItem>
          </Tooltip>
        </DelayRender>
      )}
      <div className={styles.rightAligned}>
        {actions && <div className={styles.rightActions}>{itemsRenderer(actions, (item) => item)}</div>}
      </div>
    </>
  );

  return (
    <div className={styles.container} style={containerStyles} data-testid={testid}>
      <div className={styles.loadingBarContainer}>
        {loadingState === LoadingState.Loading ? (
          <LoadingBar width={width} ariaLabel={t('panel-box.loading-bar', 'Panel loading bar')} />
        ) : null}
      </div>

      {hoverHeader && (
        <>
          <HoverWidget
            menu={menu}
            title={title}
            offset={hoverHeaderOffset}
            dragClass={dragClass}
            onOpenMenu={onOpenMenu}
          >
            {headerContent}
          </HoverWidget>

          {statusMessage && (
            <div className={styles.errorContainerFloating}>
              <PanelStatus
                message={statusMessage}
                onClick={statusMessageOnClick}
                ariaLabel={t('panel-box.panel-status', 'Panel status')}
              />
            </div>
          )}
        </>
      )}

      {hasHeader && (
        <div className={cx(styles.headerContainer, dragClass)} style={headerStyles} data-testid="header-container">
          {statusMessage && (
            <div className={dragClassCancel}>
              <PanelStatus
                message={statusMessage}
                onClick={statusMessageOnClick}
                ariaLabel={t('panel-box.panel-status', 'Panel status')}
              />
            </div>
          )}

          {headerContent}

          {menu && (
            <PanelMenu
              menu={menu}
              title={title}
              placement="bottom-end"
              menuButtonClass={cx(styles.menuItem, dragClassCancel, showOnHoverClass)}
              onOpenMenu={onOpenMenu}
            />
          )}
        </div>
      )}

      <div className={styles.content} style={contentStyle} ref={childrenContainerRef}>
        {children}
      </div>
    </div>
  );
}

const itemsRenderer = (items: ReactNode[] | ReactNode, renderer: (items: ReactNode[]) => ReactNode): ReactNode => {
  const toRender = React.Children.toArray(items).filter(Boolean);
  return toRender.length > 0 ? renderer(toRender) : null;
};

const getHeaderHeight = (theme: GrafanaTheme2, hasHeader: boolean) => {
  if (hasHeader) {
    return theme.spacing.gridSize * theme.components.panel.headerHeight;
  }

  return 0;
};

const getContentStyle = (padding: string, theme: GrafanaTheme2) => {
  const chromePadding = (padding === 'md' ? theme.components.panel.padding : 0) * theme.spacing.gridSize;

  const contentStyle: CSSProperties = {
    padding: chromePadding,
  };

  return { contentStyle };
};

const getStyles = (theme: GrafanaTheme2) => {
  const { background, borderColor, padding } = theme.components.panel;

  return {
    container: css({
      label: 'panel-container',
      backgroundColor: background,
      border: `1px solid ${borderColor}`,
      position: 'relative',
      borderRadius: theme.shape.radius.lg || theme.shape.radius.default,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',

      '.show-on-hover': {
        visibility: 'hidden',
        opacity: '0',
      },

      '&:focus-visible, &:hover': {
        // only show menu icon on hover or focused panel
        '.show-on-hover': {
          visibility: 'visible',
          opacity: '1',
        },
      },

      '&:focus-visible': {
        outline: `1px solid ${theme.colors.action.focus}`,
      },

      '&:focus-within': {
        '.show-on-hover': {
          visibility: 'visible',
          opacity: '1',
        },
      },
    }),
    loadingBarContainer: css({
      label: 'panel-loading-bar-container',
      position: 'absolute',
      top: 0,
      width: '100%',
      overflow: 'hidden',
    }),
    content: css({
      label: 'panel-content',
      flexGrow: 1,
      //contain: 'strict',
    }),
    headerContainer: css({
      label: 'panel-header',
      display: 'flex',
      alignItems: 'center',
    }),
    pointer: css({
      cursor: 'pointer',
    }),
    streaming: css({
      label: 'panel-streaming',
      marginRight: 0,
      color: theme.colors.success.text,

      '&:hover': {
        color: theme.colors.success.text,
      },
    }),
    title: css({
      label: 'panel-title',
      marginBottom: 0, // override default h6 margin-bottom
      padding: theme.spacing(0, padding),
      textOverflow: 'ellipsis',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      fontSize: theme.typography.h6.fontSize,
      fontWeight: theme.typography.h6.fontWeight,
    }),
    items: css({
      display: 'flex',
    }),
    item: css({
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }),
    hiddenMenu: css({
      visibility: 'hidden',
    }),
    menuItem: css({
      label: 'panel-menu',
      border: 'none',
      background: theme.colors.secondary.main,
      '&:hover': {
        background: theme.colors.secondary.shade,
      },
    }),
    errorContainerFloating: css({
      label: 'error-container',
      position: 'absolute',
      left: 0,
      top: 0,
      zIndex: theme.zIndex.tooltip,
    }),
    rightActions: css({
      display: 'flex',
      padding: theme.spacing(0, padding),
      gap: theme.spacing(1),
    }),
    rightAligned: css({
      label: 'right-aligned-container',
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
    }),
    titleItems: css({
      display: 'flex',
      height: '100%',
    }),
  };
};

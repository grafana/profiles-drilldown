import { css, CSSObject, cx } from '@emotion/css';
import { GrafanaTheme2, LinkModel, LinkTarget } from '@grafana/data';
import { Button, useStyles2 } from '@grafana/ui';
import React, { forwardRef } from 'react';

type TitleItemProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: LinkModel['onClick'];
  href?: string;
  target?: LinkTarget;
  title?: string;
};

type TitleItemElement = HTMLAnchorElement & HTMLButtonElement;

export const TitleItem = forwardRef<TitleItemElement, TitleItemProps>(
  ({ className, children, href, onClick, target, title, ...rest }, ref) => {
    const styles = useStyles2(getStyles);

    if (href) {
      return (
        <a
          ref={ref}
          href={href}
          onClick={onClick}
          target={target}
          title={title}
          className={cx(styles.linkItem, className)}
          {...rest}
        >
          {children}
        </a>
      );
    } else if (onClick) {
      return (
        <Button ref={ref} className={cx(styles.item, className)} variant="secondary" fill="text" onClick={onClick}>
          {children}
        </Button>
      );
    } else {
      return (
        <span ref={ref} className={cx(styles.item, className)} {...rest}>
          {children}
        </span>
      );
    }
  }
);

TitleItem.displayName = 'TitleItem';

const getStyles = (theme: GrafanaTheme2) => {
  const item = css({
    color: `${theme.colors.text.secondary}`,
    label: 'panel-header-item',
    cursor: 'auto',
    border: 'none',
    borderRadius: `${theme.shape.radius.sm || theme.shape.radius.default}`,
    padding: `${theme.spacing(0, 1)}`,
    height: `${theme.spacing(theme.components.panel.headerHeight)}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',

    '&:focus, &:focus-visible': {
      ...getFocusStyles(theme),
      zIndex: 1,
    },
    '&: focus:not(:focus-visible)': {
      outline: 'none',
      boxShadow: `none`,
    },

    '&:hover ': {
      boxShadow: `${theme.shadows.z1}`,
      background: `${theme.colors.background.secondary}`,
      color: `${theme.colors.text.primary}`,
    },
  });

  return {
    item,
    linkItem: cx(item, css({ cursor: 'pointer' })),
  };
};

function getFocusStyles(theme: GrafanaTheme2): CSSObject {
  return {
    outline: '2px dotted transparent',
    outlineOffset: '2px',
    boxShadow: `0 0 0 2px ${theme.colors.background.canvas}, 0 0 0px 4px ${theme.colors.primary.main}`,
    transitionTimingFunction: `cubic-bezier(0.19, 1, 0.22, 1)`,
    transitionDuration: '0.2s',
    transitionProperty: 'outline, outline-offset, box-shadow',
  };
}

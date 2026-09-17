import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Tag, Tooltip, useStyles2 } from '@grafana/ui';
import React from 'react';

const noOp = () => {};

type Props = {
  profileIdSelector: string;
  removeProfileIdSelector: () => void;
};

export function ProfileIdSelectorLabel(props: Props) {
  const { profileIdSelector, removeProfileIdSelector } = props;
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.container}>
      <Tooltip
        content={t(
          'flame-graph.profile-id-selector.tooltip',
          'You have added a profile id selector to the flamegraph query ({{profileIdSelector}}).',
          { profileIdSelector }
        )}
        placement="top"
      >
        <Tag
          aria-label={t('flame-graph.profile-id-selector.filter-label', 'Filter label')}
          className={styles.profileIdSelectorLabel}
          name={t('flame-graph.profile-id-selector.name', 'Profile id')}
          onClick={noOp}
        />
      </Tooltip>

      <Tag
        aria-label={t('flame-graph.profile-id-selector.filter-operator', 'Filter operator')}
        className={styles.noInteraction}
        name="="
        onClick={noOp}
        tabIndex={0}
      />

      <Tag
        aria-label={t('flame-graph.profile-id-selector.filter-value', 'Filter value')}
        name={profileIdSelector}
        className={styles.noInteraction}
        onClick={noOp}
        tabIndex={0}
      />

      <Tag
        aria-label={t('flame-graph.profile-id-selector.remove', 'Remove profile id selector from query')}
        className={styles.removeButton}
        icon="times"
        name=""
        onClick={() => removeProfileIdSelector()}
        tabIndex={0}
      />
    </div>
  );
}
const getStyles = (theme: GrafanaTheme2) => {
  const activeBackgroundColor = theme.colors.accent?.main ?? theme.colors.primary.main;
  const activeTextColor = theme.colors.accent?.contrastText ?? theme.colors.primary.contrastText;

  return {
    container: css`
      margin-top: 5px;
      display: flex;
      align-items: center;
      overflow: hidden;
      border: 1px solid ${activeBackgroundColor};
      border-radius: ${theme.shape.radius.sm || theme.shape.radius.default};

      & > button {
        height: 30px;
        background-color: ${theme.colors.background.primary};
        color: ${theme.colors.text.maxContrast};
      }

      & > :first-child {
        background-color: ${activeBackgroundColor};
        color: ${activeTextColor};
        border-radius: 0;

        &:hover {
          cursor: not-allowed !important;
        }
      }

      & > :last-child {
        border-left: 1px solid ${activeBackgroundColor};
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
      }
    `,

    removeButton: css`
      &:hover {
        background-color: ${theme.colors.background.secondary};
      }

      & svg {
        width: 12px;
        height: 12px;
      }
    `,

    profileIdSelectorLabel: css`
      &:hover {
        opacity: 1 !important;
      }
    `,

    noInteraction: css`
      &:hover {
        background-color: ${theme.colors.background.secondary};
        cursor: not-allowed !important;
      }
    `,
  };
};

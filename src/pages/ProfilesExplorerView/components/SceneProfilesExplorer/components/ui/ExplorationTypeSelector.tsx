import { css } from '@emotion/css';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { IconName, Tab, TabsBar, useStyles2 } from '@grafana/ui';
import React from 'react';

type ExplorationTypeSelectorProps = {
  options: Array<SelectableValue<string>>;
  value: string;
  onChange: (newValue: string) => void;
};

export function ExplorationTypeSelector({ options, value, onChange }: ExplorationTypeSelectorProps) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.explorationTypeContainer} data-testid="exploration-types">
      <TabsBar className={styles.tabsBar}>
        {options.map((option) => {
          const isActive = value === option.value;

          return (
            <Tab
              key={option.value}
              id={`profiles-exploration-${option.value}`}
              className={option.icon ? styles.tabWithIcon : undefined}
              label={option.label ?? ''}
              active={isActive}
              icon={option.icon as IconName | undefined}
              truncate
              tooltip={option.description}
              aria-label={option.label}
              {...(isActive ? { 'data-testid': 'is-active' as const } : {})}
              onChangeTab={() => {
                if (!isActive) {
                  onChange(option.value as string);
                }
              }}
            />
          );
        })}
      </TabsBar>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  explorationTypeContainer: css`
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
  `,
  tabsBar: css`
    max-width: 100%;
    flex: 1 1 auto;
    min-width: ${theme.spacing(1)};
  `,
  /** Tab uses `display: block` on the control; icon + label align cleaner as a centered flex row */
  tabWithIcon: css`
    align-items: center;

    & button[type='button'] {
      display: inline-flex;
      align-items: center;
      line-height: ${theme.typography.bodySmall.lineHeight};
    }
  `,
});

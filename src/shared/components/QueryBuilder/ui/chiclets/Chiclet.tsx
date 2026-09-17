import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import React, { memo } from 'react';

import { CompleteFilter, Filter, FilterKind, FilterPartKind } from '../../domain/types';
import { ChicletAttributeOperator } from './ChicletAttributeOperator';
import { ChicletAttributeOperatorValue } from './ChicletAttributeOperatorValue';
import { PartialChiclet } from './PartialChiclet';

type ChicletProps = {
  filter: Filter;
  onClick: (event: React.MouseEvent<HTMLElement>, filter: Filter, part: FilterPartKind) => void;
  onRemove: (event: React.MouseEvent<HTMLElement>, filter: CompleteFilter) => void;
};

const activeBackgroundColor = 'rgb(61, 113, 217)';
const activeTextColor = '#fff';
const inactiveBorderColor = '#4a4b52';

export const getStyles = (theme: GrafanaTheme2) => ({
  chiclet: css`
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
  partialChiclet: css`
    border-color: ${inactiveBorderColor};
    overflow: hidden;

    & > :first-child {
      background-color: ${theme.colors.background.secondary};
      color: ${theme.colors.text.maxContrast};
      border-radius: 0;
      border-left: 0;

      &:hover {
        cursor: pointer !important;
      }
    }

    & > :last-child {
      border-color: ${inactiveBorderColor};
      color: ${theme.colors.text.maxContrast};
    }
  `,
  inactiveChiclet: css`
    border-color: ${inactiveBorderColor};

    & > button {
      color: ${theme.colors.text.maxContrast};
    }

    & > :first-child {
      background-color: ${theme.colors.background.secondary};
      color: ${theme.colors.text.maxContrast};
    }

    & > :last-child {
      border-color: ${inactiveBorderColor};
    }
  `,
  chicletAttribute: css`
    &:hover {
      opacity: 1 !important;
    }
  `,
  chicletOperator: css`
    &:hover {
      background-color: ${theme.colors.background.secondary};
    }
  `,
  chicletValue: css`
    flex-grow: 1;
    text-align: left;
    max-width: 420px;
    text-overflow: ellipsis;
    text-wrap: nowrap;
    overflow: hidden;

    &:hover {
      background-color: ${theme.colors.background.secondary};
    }
  `,
  chicletRemoveButton: css`
    &:hover {
      background-color: ${theme.colors.background.secondary};
    }

    & svg {
      width: 12px;
      height: 12px;
    }
  `,
});

const ChicletComponent = ({ filter, onClick, onRemove }: ChicletProps) => {
  switch (filter.type) {
    case FilterKind.partial:
      return <PartialChiclet filter={filter} onClick={onClick} />;

    case FilterKind['attribute-operator-value']:
      return <ChicletAttributeOperatorValue filter={filter as CompleteFilter} onClick={onClick} onRemove={onRemove} />;

    case FilterKind['attribute-operator']:
      return <ChicletAttributeOperator filter={filter as CompleteFilter} onClick={onClick} onRemove={onRemove} />;

    default:
      throw new TypeError(`Unsupported filter type "${filter.type}" (${JSON.stringify(filter)})!`);
  }
};

export const Chiclet = memo(
  ChicletComponent,
  (prevProps, nextProps) => JSON.stringify(prevProps.filter) === JSON.stringify(nextProps.filter)
);

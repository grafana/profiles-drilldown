import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { SceneComponentProps, SceneObjectBase, SceneObjectState, VariableDependencyConfig } from '@grafana/scenes';
import { IconButton, useStyles2 } from '@grafana/ui';
import { reportInteraction } from '@shared/domain/reportInteraction';
import React from 'react';

import { GridItemData } from '../../components/SceneByVariableRepeaterGrid/types/GridItemData';
import { Favorite, FavoritesDataSource } from '../../infrastructure/favorites/FavoritesDataSource';
import { interpolateQueryRunnerVariables } from '../../infrastructure/helpers/interpolateQueryRunnerVariables';

interface FavActionState extends SceneObjectState {
  item: GridItemData;
  isFav?: boolean;
  skipVariablesInterpolation?: boolean;
}

export class FavAction extends SceneObjectBase<FavActionState> {
  protected _variableDependency = new VariableDependencyConfig(this, {
    variableNames: ['serviceName', 'profileMetricId', 'filters'],
    onReferencedVariableValueChanged: () => {
      this.update();
    },
  });

  constructor(state: FavActionState) {
    super(state);

    this.addActivationHandler(() => this.update());
  }

  update() {
    this.setState({ isFav: this.isStored() });
  }

  isStored() {
    return FavoritesDataSource.exists(this.buildFavorite());
  }

  static buildFavorite(item: GridItemData): Favorite {
    const { index, queryRunnerParams, panelType } = item;

    const favorite: Favorite = {
      index,
      queryRunnerParams: {
        serviceName: queryRunnerParams.serviceName as string,
        profileMetricId: queryRunnerParams.profileMetricId as string,
      },
      panelType,
    };

    // we don't store values, we'll fetch all timeseries by using the `groupBy` parameter
    if (queryRunnerParams.groupBy) {
      favorite.queryRunnerParams.groupBy = {
        label: queryRunnerParams.groupBy.label,
      };
    }

    // we don't store filters if empty
    if (queryRunnerParams.filters?.length) {
      favorite.queryRunnerParams.filters = queryRunnerParams.filters;
    }

    return favorite;
  }

  buildFavorite(): Favorite {
    const { item, skipVariablesInterpolation } = this.state;

    return FavAction.buildFavorite({
      index: item.index,
      queryRunnerParams: skipVariablesInterpolation
        ? item.queryRunnerParams
        : interpolateQueryRunnerVariables(this, item),
      panelType: item.panelType,
    } as GridItemData);
  }

  public onClick = () => {
    reportInteraction('g_pyroscope_app_fav_action_clicked', { favAfterClick: !this.state.isFav });

    if (!this.state.isFav) {
      FavoritesDataSource.addFavorite(this.buildFavorite());
    } else {
      FavoritesDataSource.removeFavorite(this.buildFavorite());
    }

    this.setState({ isFav: !this.state.isFav });
  };

  public static Component = ({ model }: SceneComponentProps<FavAction>) => {
    const styles = useStyles2(getStyles);
    const { isFav } = model.useState();

    return (
      <IconButton
        className={isFav ? styles.favedButton : styles.notFavedbutton}
        name={isFav ? 'favorite' : 'star'}
        variant="secondary"
        size="sm"
        aria-label={isFav ? t('actions.fav.unfavorite', 'Unfavorite') : t('actions.fav.favorite', 'Favorite')}
        tooltip={isFav ? t('actions.fav.unfavorite', 'Unfavorite') : t('actions.fav.favorite', 'Favorite')}
        tooltipPlacement="top"
        onClick={model.onClick}
      />
    );
  };
}

const getStyles = (theme: GrafanaTheme2) => ({
  favedButton: css`
    color: ${theme.visualization.getColorByName('yellow')};
    margin: 0;
  `,
  notFavedbutton: css`
    margin: 0;
  `,
});

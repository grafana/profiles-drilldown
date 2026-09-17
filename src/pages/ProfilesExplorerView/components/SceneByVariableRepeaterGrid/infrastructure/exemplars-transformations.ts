import {
  createDataFrame,
  DataFrame,
  DataLinkClickEvent,
  DataTopic,
  Field,
  FieldMatcherID,
  FieldType,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { config } from '@grafana/runtime';
import { CustomTransformerDefinition, sceneGraph, SceneObject } from '@grafana/scenes';
import { map, Observable } from 'rxjs';

import { EventViewServiceFlameGraph } from '../../../domain/events/EventViewServiceFlameGraph';
import { ProfileIdSelectorVariable } from '../../../domain/variables/ProfileIdSelectorVariable';
import { SceneExploreServiceFlameGraph } from '../../SceneExploreServiceFlameGraph/SceneExploreServiceFlameGraph';
import { TimeseriesReprocess } from '../../SceneLabelValuesTimeseries/domain/events/TimeseriesReprocess';
import { GridItemData } from '../types/GridItemData';

/**
 * Encapsulates exemplar-related data transformations for timeseries visualizations.
 * Provides methods to add exemplar links, highlight selected exemplars, and manage exemplar transformations.
 */

export const HIGHLIGHTED_EXEMPLAR_REF_ID = 'highlightedExemplar';
export const HIGHLIGHTED_SERIES_REF_ID = 'highlightedSeries';

export const highlightedSeriesOverrides = {
  matcher: { id: FieldMatcherID.byFrameRefID, options: HIGHLIGHTED_SERIES_REF_ID },
  properties: [
    {
      id: 'displayName',
      value: 'selected profile: $profileIdSelector',
    },
    {
      id: 'color',
      value: { mode: 'fixed', fixedColor: config.theme2.visualization.getColorByName('blue') },
    },
  ],
};

export class ExemplarTransformations {
  static addExemplarTransformations(sceneObject: SceneObject, item: GridItemData): CustomTransformerDefinition[] {
    return [
      ExemplarTransformations.addExemplarLinks(sceneObject, item),
      ExemplarTransformations.highlightSelectedExemplar(sceneObject),
      ExemplarTransformations.highlightSelectedSeries(sceneObject),
    ];
  }

  private static addExemplarLinks(sceneObject: SceneObject, item: GridItemData): CustomTransformerDefinition {
    return {
      topic: DataTopic.Annotations,
      operator: () => (source: Observable<DataFrame[]>) => {
        return source.pipe(
          map((data: DataFrame[]) =>
            data.map((frame) => {
              if (frame.name !== 'exemplar') {
                return frame;
              }

              const profileIdField = frame.fields.find((field: Field) => field.name === 'Id');
              if (!profileIdField) {
                return frame;
              }

              profileIdField.config.links = [
                {
                  title: t('grid.exemplars.view-profile', 'View profile'),
                  url: '',
                  onClick: ExemplarTransformations.showExemplarOnClickHandler(sceneObject, item),
                },
              ];

              return frame;
            })
          )
        );
      },
    };
  }

  private static highlightSelectedExemplar(sceneObject: SceneObject): CustomTransformerDefinition {
    return {
      topic: DataTopic.Annotations,
      operator: () => (source: Observable<DataFrame[]>) => {
        const profileIdSelector = sceneGraph.findByKeyAndType(
          sceneObject,
          'profileIdSelector',
          ProfileIdSelectorVariable
        ).state.value;
        if (!profileIdSelector) {
          return source;
        }
        return source.pipe(
          map((data: DataFrame[]) => {
            // profileIdSelector should only be defined in flame graph view, where the exemplar frame should be unique.
            const exemplarFrame = data.find((frame) => frame.name === 'exemplar');
            if (!exemplarFrame) {
              return data;
            }

            // Find the Id field to match against profileIdSelector
            const idField = exemplarFrame.fields.find((field: Field) => field.name === 'Id');
            if (!idField) {
              return data;
            }

            // Find the index where Id field equals profileIdSelector
            const matchingIndex = idField.values.findIndex((id: string) => id === profileIdSelector);
            const highlightedFrame = ExemplarTransformations.createHighlightedFrame(exemplarFrame, matchingIndex);
            return [...data, highlightedFrame];
          })
        );
      },
    };
  }

  // Creates a frame with empty field values that acts as a control frame:
  // its presence triggers dimming of other series and adds a legend entry,
  // but it doesn't render any visible data points.
  private static createHighlightedSeriesFrame(firstSeriesFrame: DataFrame): DataFrame {
    const highlightedFrame = createDataFrame({
      ...firstSeriesFrame,
      refId: HIGHLIGHTED_SERIES_REF_ID,
    });

    highlightedFrame.fields.forEach((field: Field) => {
      field.values = [];
      if (field.type === 'number') {
        field.labels = { ...(field.labels || {}), highlighted: 'true' };
      }
    });

    return highlightedFrame;
  }

  private static highlightSelectedSeries(sceneObject: SceneObject): CustomTransformerDefinition {
    return {
      topic: DataTopic.Series,
      operator: () => (source: Observable<DataFrame[]>) => {
        const profileIdSelector = sceneGraph.findByKeyAndType(
          sceneObject,
          'profileIdSelector',
          ProfileIdSelectorVariable
        ).state.value;
        if (!profileIdSelector) {
          return source;
        }
        return source.pipe(
          map((data: DataFrame[]) => {
            if (data.length === 0) {
              return data;
            }

            // profileIdSelector should only be defined in flame graph view, where the series frame should be unique.
            const firstSeriesFrame = data[0];
            const highlightedFrame = ExemplarTransformations.createHighlightedSeriesFrame(firstSeriesFrame);
            return [...data, highlightedFrame];
          })
        );
      },
    };
  }

  private static showExemplarOnClickHandler(sceneObject: SceneObject, item: GridItemData) {
    return (event: DataLinkClickEvent<any>) => {
      const profileId = event.replaceVariables?.('${__value.raw}');

      if (profileId) {
        const isFlamegraphView = sceneObject.parent?.parent instanceof SceneExploreServiceFlameGraph;
        if (isFlamegraphView) {
          sceneGraph
            .findByKeyAndType(sceneObject, 'profileIdSelector', ProfileIdSelectorVariable)
            .changeValueTo(profileId);
          sceneObject.publishEvent(new TimeseriesReprocess({}), true);
        } else {
          sceneObject.publishEvent(
            new EventViewServiceFlameGraph({
              item: {
                ...item,
                queryRunnerParams: {
                  ...item.queryRunnerParams,
                  profileIdSelector: profileId,
                },
              },
            }),
            true
          );
        }
      }
    };
  }

  private static createHighlightedFrame(exemplarFrame: DataFrame, matchingIndex: number): DataFrame {
    const highlightedFrame = createDataFrame({
      ...exemplarFrame,
      refId: HIGHLIGHTED_EXEMPLAR_REF_ID,
    });
    highlightedFrame.length = matchingIndex >= 0 ? 1 : 0;

    highlightedFrame.fields.forEach((field: Field) => {
      if (matchingIndex >= 0) {
        field.values = [field.values[matchingIndex]];
      } else {
        field.values = [];
      }
    });

    highlightedFrame.fields.push({
      name: 'highlighted',
      type: FieldType.string,
      values: matchingIndex >= 0 ? ['true'] : [],
      config: {},
    });

    return highlightedFrame;
  }
}

export const addExemplarTransformations = ExemplarTransformations.addExemplarTransformations;

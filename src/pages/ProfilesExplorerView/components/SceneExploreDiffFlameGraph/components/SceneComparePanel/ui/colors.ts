import { colorManipulator } from '@grafana/data';
import { config } from '@grafana/runtime';

function vizColor(name: string) {
  return config.theme2.visualization.getColorByName(name);
}

export const BASELINE_COLORS = {
  get COLOR() {
    return vizColor('purple');
  },
  get OVERLAY() {
    return colorManipulator.alpha(vizColor('purple'), 0.3);
  },
};

export const COMPARISON_COLORS = {
  get COLOR() {
    return vizColor('blue');
  },
  get OVERLAY() {
    return colorManipulator.alpha(vizColor('blue'), 0.3);
  },
};

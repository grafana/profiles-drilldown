/**
 * TODO: This is a shameless copy of OpenInAssistant from @grafana/assistant package tweaked to support
 * providing context asynchronously. It will be moved to @grafana/assistant package once tested and verified.
 */
import { css } from '@emotion/css';
import { ChatContextItem, OpenAssistantProps, useAssistant } from '@grafana/assistant';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, useStyles2 } from '@grafana/ui';
import React from 'react';

export interface OpenAssistantButtonProps {
  /** Provides prompt and context asynchronously */
  contextProvider: () => Promise<ContextProviderResults | undefined>;
  /** Origin of the request that opened the assistant. This is used to track the source of the request. Should be a structured string using forward slashes, with the first part as a namespace. Examples: 'grafana-datasources/prometheus/query-builder', 'grafana-slo-app/slo-editor-overview', 'grafana/trace-view-analyzer`. */
  origin: string;
  /** Whether to automatically send the prompt. Optional, defaults to true. */
  autoSend?: boolean;
  /** Text to display on the button. Optional, defaults to 'Analyze with Assistant' */
  title?: string;
  /** Button size, defaults to sm */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** If true, the button will be Assistant icon only with name as title. Defaults to false. */
  iconOnlyButton?: boolean;
  /** Function to call when the button is clicked. Optional, defaults to undefined. */
  onClick?: () => void;
}

/**
 * A button component that opens the Grafana Assistant with configurable prompt and context.
 */
export function OpenAssistantButtonAsync(props: OpenAssistantButtonProps) {
  // If the assistant is not available, return empty
  const { isAvailable, openAssistant } = useAssistant();
  if (!isAvailable || !openAssistant) {
    return null;
  }
  return <OpenAssistantButtonView {...props} openAssistant={openAssistant} />;
}

export type ContextProviderResults = {
  /** Prompt to pass to the openAssistant function. */
  prompt: string;
  /** Context to pass to the openAssistant function. Optional, defaults to undefined. Created with `createAssistantContextItem`. */
  context?: ChatContextItem[];
};

/**
 * Presentational component separated from OpenAssistantButton to avoid hook dependencies in Storybook.
 * It is not exported for users of the package.
 */
export function OpenAssistantButtonView({
  contextProvider,
  origin,
  autoSend = true,
  title = 'Analyze with Assistant',
  size = 'sm',
  openAssistant,
  onClick,
}: OpenAssistantButtonProps & {
  openAssistant: (props: OpenAssistantProps) => void;
}) {
  const styles = useStyles2(getStyles);

  return (
    <Button
      icon="ai-sparkle"
      onClick={async () => {
        const result = await contextProvider();
        if (!result) {
          return;
        }
        const { prompt, context } = result;
        onClick?.();
        openAssistant({ prompt, context, autoSend, origin });
      }}
      variant="secondary"
      fill="solid"
      size={size}
      title={title}
      aria-label={title}
      className={styles.button}
      data-testid="assistant-button"
    >
      {title}
    </Button>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  const baseBackground = theme.colors.secondary.main;
  const elevatedBackground = theme.colors.emphasize(baseBackground, 0.05);

  // Canvas is what's typically underneath buttons
  const underlyingColor = theme.colors.background.canvas;

  const borderWidth = 1;
  const outerRadius = theme.shape.radius.md || theme.shape.radius.default;
  // inner radius = outer radius - border width, but take at least 1px
  const innerRadius = `max(calc(${outerRadius} - ${borderWidth}px), 1px)`;

  // Gradient border layer (::before)
  const gradientBorderLayer = {
    content: '""',
    position: 'absolute' as const,
    inset: 0,
    borderRadius: outerRadius,
    cornerShape: 'squircle',
    background: 'linear-gradient(90deg, rgb(168, 85, 247), rgb(249, 115, 22))',
    zIndex: -2,
    pointerEvents: 'none' as const,
  };

  // Solid background layer factory (::after)
  // Layer transparent color over canvas to make it opaque and mask the gradient properly
  const solidBackgroundLayer = (background: string) => ({
    content: '""',
    position: 'absolute' as const,
    inset: `${borderWidth}px`,
    borderRadius: innerRadius,
    cornerShape: 'squircle',
    background: `linear-gradient(${background}, ${background}), ${underlyingColor}`,
    zIndex: -1,
    transition: 'none',
    pointerEvents: 'none' as const,
  });

  return {
    button: css({
      label: 'assistant-button',
      position: 'relative',
      isolation: 'isolate',
      border: 'none',
      transition: 'none !important',
      '&::before': gradientBorderLayer,
      '&::after': {
        ...solidBackgroundLayer(baseBackground),
        transition: 'none',
      },
      '&:hover': {
        transition: 'none !important',
      },
      '&:hover::after': {
        background: `linear-gradient(${elevatedBackground}, ${elevatedBackground}), ${underlyingColor}`,
      },
    }),
    icon: css({
      label: 'assistant-icon',
      position: 'relative',
      isolation: 'isolate',
      border: 'none',
      background: 'none',
      padding: theme.spacing(0.5),
      '&::before': { ...gradientBorderLayer, transition: 'background 0.1s ease' },
      '&:hover::after': {
        ...solidBackgroundLayer(baseBackground),
        background: `linear-gradient(${elevatedBackground}, ${elevatedBackground}), ${underlyingColor}`,
      },
    }),
  };
};

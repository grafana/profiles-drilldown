import { createDataFrame, DataFrame, FieldType } from '@grafana/data';

/**
 * Tree utilities for progressive flame graph loading: the coarse profile returned by the initial query is turned into
 * a tree, refined subtrees are merged into it, and the result is turned back into a data frame for the flame graph.
 */

// Pyroscope names the node standing in for a truncated subtree 'other' (see model.truncatedNodeName).
export const TRUNCATED_NODE_NAME = 'other';

export type ProfileTreeNode = {
  name: string;
  total: number;
  self: number;
  children: ProfileTreeNode[];
};

export function dataFrameToTree(frame: DataFrame): ProfileTreeNode | undefined {
  const labelField = frame.fields.find((f) => f.name === 'label');
  const levelField = frame.fields.find((f) => f.name === 'level');
  const valueField = frame.fields.find((f) => f.name === 'value');
  const selfField = frame.fields.find((f) => f.name === 'self');

  if (!labelField || !levelField || !valueField || !selfField) {
    return undefined;
  }

  const enumText = labelField.config?.type?.enum?.text;
  const labelAt = (i: number) =>
    enumText ? String(enumText[labelField.values[i]] ?? '') : String(labelField.values[i]);

  let root: ProfileTreeNode | undefined;
  const lastAtLevel: ProfileTreeNode[] = [];

  // The nested set format is a depth first pre-order walk, so the parent of a node at level L is the most recent node
  // seen at level L-1.
  for (let i = 0; i < levelField.values.length; i++) {
    const level = levelField.values[i];
    const node: ProfileTreeNode = {
      name: labelAt(i),
      total: valueField.values[i],
      self: selfField.values[i],
      children: [],
    };

    if (level === 0) {
      root = node;
    } else {
      lastAtLevel[level - 1]?.children.push(node);
    }

    lastAtLevel[level] = node;
  }

  return root;
}

export function treeToDataFrame(root: ProfileTreeNode, unit: string): DataFrame {
  const labelValues: string[] = [];
  const levelValues: number[] = [];
  const selfValues: number[] = [];
  const valueValues: number[] = [];

  const stack: Array<{ node: ProfileTreeNode; level: number }> = [{ node: root, level: 0 }];

  while (stack.length) {
    const { node, level } = stack.shift()!;

    labelValues.push(node.name);
    levelValues.push(level);
    selfValues.push(node.self);
    valueValues.push(node.total);

    stack.unshift(...node.children.map((child) => ({ node: child, level: level + 1 })));
  }

  return createDataFrame({
    name: 'response',
    meta: { preferredVisualisationType: 'flamegraph' },
    fields: [
      { name: 'level', values: levelValues },
      { name: 'label', values: labelValues, type: FieldType.string },
      { name: 'self', values: selfValues, config: { unit } },
      { name: 'value', values: valueValues, config: { unit } },
    ],
  });
}

export function resolvePath(root: ProfileTreeNode, path: string[]): ProfileTreeNode | undefined {
  let node: ProfileTreeNode | undefined = root;

  for (const name of path) {
    node = node?.children.find((child) => child.name === name);
  }

  return node;
}

export function countNodes(node: ProfileTreeNode): number {
  let count = 1;

  for (const child of node.children) {
    count += countNodes(child);
  }

  return count;
}

/**
 * Replaces the target's children with the refined ones, keeping an existing child subtree when it is already more
 * detailed than the refinement, so that a broad refinement landing late never discards a deeper one.
 */
export function mergeChildren(target: ProfileTreeNode, refined: ProfileTreeNode) {
  const existingByName = new Map(target.children.map((child) => [child.name, child]));

  target.children = refined.children.map((refinedChild) => {
    const existing = existingByName.get(refinedChild.name);

    if (existing && refinedChild.name !== TRUNCATED_NODE_NAME && countNodes(existing) > countNodes(refinedChild)) {
      return existing;
    }

    return refinedChild;
  });
}

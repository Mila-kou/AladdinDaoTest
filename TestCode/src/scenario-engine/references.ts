export type ReferenceKind = 'order' | 'position';

export interface ScenarioRef<K extends ReferenceKind = ReferenceKind> {
  readonly kind: K;
  readonly name: string;
}

function createRef<K extends ReferenceKind>(kind: K, name: string): ScenarioRef<K> {
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) {
    throw new Error(`引用名称必须是字母开头的字母、数字或连字符：${name}`);
  }
  return Object.freeze({ kind, name });
}

export const ref = {
  order: (name: string): ScenarioRef<'order'> => createRef('order', name),
  position: (name: string): ScenarioRef<'position'> => createRef('position', name),
};

export function referenceKey(value: ScenarioRef): string {
  return `${value.kind}:${value.name}`;
}


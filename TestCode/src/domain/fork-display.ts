const OPAQUE_FORK_ID = /^[0-9a-f]{6,}(?:-[0-9a-f]{4,})*$/i;

/**
 * Tenderly RPC 路径通常是 organization/project/fork-id。
 * fork-id 是定位符，不是用户可读名称；没有显式名称时只展示组织/项目。
 */
export function normalizeForkDisplayName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length >= 3 && OPAQUE_FORK_ID.test(segments.at(-1)!)) {
    return segments.slice(0, -1).join('/');
  }
  return trimmed;
}

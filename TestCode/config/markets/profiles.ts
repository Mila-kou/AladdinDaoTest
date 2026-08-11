export const marketProfileNames = [
  'NORMAL',
  'LONG_CROWDED',
  'SHORT_CROWDED',
  'FUNDING_LONG_PAYS',
  'FUNDING_SHORT_PAYS',
  'FUNDING_CLAMP_BOUNDARY',
  'EXTREME_PRICE_UP',
  'EXTREME_PRICE_DOWN',
  'USDC_DEPEG',
  'LIQUIDATION_BOUNDARY',
  'OI_LIMIT',
] as const;

export type MarketProfileName = (typeof marketProfileNames)[number];

export const marketProfilePurpose: Record<MarketProfileName, string> = {
  NORMAL: '真实参数附近的正常交易基线',
  LONG_CROWDED: 'Long OI 显著高于 Short OI',
  SHORT_CROWDED: 'Short OI 显著高于 Long OI',
  FUNDING_LONG_PAYS: '构造 Long 支付 Funding 的稳定状态',
  FUNDING_SHORT_PAYS: '构造 Short 支付 Funding 的稳定状态',
  FUNDING_CLAMP_BOUNDARY: '动态计算并构造 Funding Min/Max Clamp 边界',
  EXTREME_PRICE_UP: '单市场极端上涨',
  EXTREME_PRICE_DOWN: '单市场极端下跌',
  USDC_DEPEG: '抵押币 Oracle min/max 脱锚',
  LIQUIDATION_BOUNDARY: '有效抵押恰好位于清算边界',
  OI_LIMIT: 'Open Interest 或储备上限边界',
};

// 这里只定义 Profile 名称和用途。数值必须在部署清单、链上执行时读数
// 以及单场景覆盖三层合并后生成，不能把文档快照当成永恒常量。

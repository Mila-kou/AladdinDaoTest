export type DefaultMockParameterValueType = 'uint' | 'int';

export type DefaultMockParameterArgument =
  | { readonly type: 'marketIndex' }
  | { readonly type: 'bool'; readonly value: boolean }
  | { readonly type: 'bytes32Key'; readonly value: string };

export interface DefaultMockMarketParameter {
  readonly baseKey: string;
  readonly baseKeyEncoding?: 'abi-string' | 'packed-string';
  readonly valueType: DefaultMockParameterValueType;
  readonly arguments: readonly DefaultMockParameterArgument[];
}

const market = (): DefaultMockParameterArgument => ({ type: 'marketIndex' });
const side = (value: boolean): DefaultMockParameterArgument => ({ type: 'bool', value });
const bytes32Key = (value: string): DefaultMockParameterArgument => ({ type: 'bytes32Key', value });

/**
 * default-mock-v1 是 Fork 初始化的完整 Synthetic Market 基线。
 *
 * 数值不在这里重复硬编码，而是从同一部署版本的 MockBTC 参考市场读取并复制，
 * 避免文档快照与实际 Fork 参数漂移。该清单明确限定要复制的交易、风控、费率、
 * Funding、价格影响与执行补贴参数，运行时会逐项回读校验。
 */
export const defaultMockMarketProfile = {
  id: 'default-mock-v1',
  referenceMarketIndex: 1,
  token: {
    name: 'FX100 Default Mock Token',
    symbol: 'FXMOCK',
    decimals: 18,
  },
  oracle: {
    description: 'FXMOCK / USD',
    decimals: 8,
    initialPrice: 60_000n * 10n ** 8n,
    heartbeatDuration: 86_400n,
  },
  parameters: [
    { baseKey: 'MAX_PNL_FACTOR', valueType: 'uint', arguments: [bytes32Key('MAX_PNL_FACTOR_FOR_TRADERS'), market(), side(true)] },
    { baseKey: 'MAX_PNL_FACTOR', valueType: 'uint', arguments: [bytes32Key('MAX_PNL_FACTOR_FOR_TRADERS'), market(), side(false)] },
    { baseKey: 'POSITION_IMPACT_FACTOR', valueType: 'uint', arguments: [market(), side(true)] },
    { baseKey: 'POSITION_IMPACT_FACTOR', valueType: 'uint', arguments: [market(), side(false)] },
    { baseKey: 'POSITION_IMPACT_EXPONENT_FACTOR', valueType: 'uint', arguments: [market(), side(true)] },
    { baseKey: 'POSITION_IMPACT_EXPONENT_FACTOR', valueType: 'uint', arguments: [market(), side(false)] },
    { baseKey: 'MAX_POSITION_IMPACT_FACTOR', valueType: 'uint', arguments: [market(), side(true)] },
    { baseKey: 'MAX_POSITION_IMPACT_FACTOR', valueType: 'uint', arguments: [market(), side(false)] },
    { baseKey: 'LIQUIDATION_FEE_FACTOR', valueType: 'uint', arguments: [market()] },
    { baseKey: 'EXECUTION_FEE_SUBSIDIZE', baseKeyEncoding: 'packed-string', valueType: 'uint', arguments: [market()] },
    { baseKey: 'EXECUTION_FEE_SUBSIDIZE_SIZE', baseKeyEncoding: 'packed-string', valueType: 'uint', arguments: [market()] },
    { baseKey: 'MAX_POSITION_SIZE_USD', valueType: 'uint', arguments: [market()] },
    { baseKey: 'MIN_COLLATERAL_FACTOR', valueType: 'uint', arguments: [market()] },
    { baseKey: 'MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION', valueType: 'uint', arguments: [market()] },
    { baseKey: 'MAX_OPEN_INTEREST', valueType: 'uint', arguments: [market(), side(true)] },
    { baseKey: 'MAX_OPEN_INTEREST', valueType: 'uint', arguments: [market(), side(false)] },
    { baseKey: 'MAX_OPEN_INTEREST_FACTOR', valueType: 'uint', arguments: [market(), side(true)] },
    { baseKey: 'MAX_OPEN_INTEREST_FACTOR', valueType: 'uint', arguments: [market(), side(false)] },
    { baseKey: 'RESERVE_FACTOR', valueType: 'uint', arguments: [market()] },
    { baseKey: 'CONSTANT_PRICE_SPREAD', valueType: 'uint', arguments: [market()] },
    { baseKey: 'BID_ORDER_BOOK_DEPTH', valueType: 'uint', arguments: [market()] },
    { baseKey: 'ASK_ORDER_BOOK_DEPTH', valueType: 'uint', arguments: [market()] },
    { baseKey: 'PRICE_IMPACT_PARAMETER', valueType: 'uint', arguments: [market()] },
    { baseKey: 'POSITION_FEE_FACTOR', valueType: 'uint', arguments: [market(), side(true)] },
    { baseKey: 'POSITION_FEE_FACTOR', valueType: 'uint', arguments: [market(), side(false)] },
    { baseKey: 'SKEW_IMPACT_FACTOR', valueType: 'int', arguments: [market()] },
    { baseKey: 'MIN_SKEW_IMPACT', valueType: 'int', arguments: [market()] },
    { baseKey: 'MAX_SKEW_IMPACT', valueType: 'int', arguments: [market()] },
    // FX100Keys.sol 对 Grace 使用 keccak256("NAME")，不是项目大多数参数使用的 abi.encode(string)。
    { baseKey: 'LIQUIDATION_GRACE_PERIOD_BASE', baseKeyEncoding: 'packed-string', valueType: 'uint', arguments: [market()] },
    { baseKey: 'FUNDING_FLOOR_FACTOR', valueType: 'int', arguments: [market()] },
    { baseKey: 'FUNDING_BASE_FACTOR', valueType: 'int', arguments: [market()] },
    { baseKey: 'MIN_FUNDING_FACTOR_PER_SECOND', valueType: 'int', arguments: [market()] },
    { baseKey: 'MAX_FUNDING_FACTOR_PER_SECOND', valueType: 'int', arguments: [market()] },
  ] satisfies readonly DefaultMockMarketParameter[],
} as const;

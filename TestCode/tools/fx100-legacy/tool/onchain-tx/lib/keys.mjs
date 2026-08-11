// DataStore key 派生 + Position key。
// 口径依据 src/constants/FX100Keys.sol 与 src/position/Position.sol；
// 本文件涉及的 key 全部是 keccak256(abi.encode("NAME")) 口径——
// config-dump README 里那 4 个裸串 key（LIQUIDATION_GRACE_PERIOD_* / EXECUTION_FEE_SUBSIDIZE*）
// 不在这里，需要时务必另走 keccak256Utf8，混用会读到恒 0 的空槽位。

import { abiEncode, hashEncoded } from "../../config-dump/lib/abi.mjs";
import { keccak256Bytes, fromHex, toHex } from "../../config-dump/lib/keccak.mjs";

const base = (name) => hashEncoded([{ type: "string", value: name }]);

export const BASE = {
  CUMULATIVE_OPEN_COSTS: base("CUMULATIVE_OPEN_COSTS"),
  OPEN_INTEREST_IN_TOKENS: base("OPEN_INTEREST_IN_TOKENS"),
  CLAIMABLE_FEE_AMOUNT: base("CLAIMABLE_FEE_AMOUNT"),
  POSITION_IMPACT_POOL_AMOUNT: base("POSITION_IMPACT_POOL_AMOUNT"),
  POSITION_FEE_TYPE: base("POSITION_FEE_TYPE"),
  FUNDING_FEE_TYPE: base("FUNDING_FEE_TYPE"),
  LIQUIDATION_FEE_TYPE: base("LIQUIDATION_FEE_TYPE"),
  POSITION_FEE_FACTOR: base("POSITION_FEE_FACTOR"),
  POSITION_FEE_RECEIVER_FACTOR: base("POSITION_FEE_RECEIVER_FACTOR"),
  MIN_POSITION_SIZE_USD: base("MIN_POSITION_SIZE_USD"),
  // 提取抵押的两道闸门用到的参数（IT-POS-017/018/019）：
  //   预检 willPositionCollateralBeSufficient：剩余抵押 × 价 ≥ MIN_COLLATERAL_USD（**不扣平仓费**）
  //   终检：                            (剩余抵押 − 平仓费) × 价 ≥ sizeInUsd × MIN_COLLATERAL_FACTOR
  // 两道口径不一致是已登记的 ISS-015。
  MIN_COLLATERAL_USD: base("MIN_COLLATERAL_USD"),
  MIN_COLLATERAL_FACTOR: base("MIN_COLLATERAL_FACTOR"),
  RESERVE_FACTOR: base("RESERVE_FACTOR"),
  MAX_OPEN_INTEREST: base("MAX_OPEN_INTEREST"),
  ORDER_LIST: base("ORDER_LIST"),
  ACCOUNT_ORDER_LIST: base("ACCOUNT_ORDER_LIST"),
  // 清算域（IT-LIQ-*）
  MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION: base("MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION"),
  LIQUIDATION_FEE_FACTOR: base("LIQUIDATION_FEE_FACTOR"),
  LIQUIDATION_FEE_RECEIVER_FACTOR: base("LIQUIDATION_FEE_RECEIVER_FACTOR"),
  // 价格源改指（fork 上把 oracle 换成可控 mock 聚合器，见 integration/lib/pricefeed.mjs）
  PRICE_FEED: base("PRICE_FEED"),
  PRICE_FEED_MULTIPLIER: base("PRICE_FEED_MULTIPLIER"),
  PRICE_FEED_HEARTBEAT_DURATION: base("PRICE_FEED_HEARTBEAT_DURATION"),
  STABLE_PRICE: base("STABLE_PRICE"),
  ORACLE_PROVIDER_FOR_TOKEN: base("ORACLE_PROVIDER_FOR_TOKEN"),
  IS_ORACLE_PROVIDER_ENABLED: base("IS_ORACLE_PROVIDER_ENABLED"),
  // 资金费（funding 计算与核对，附录 C §〇.8）
  // ⚠️ per-size 两个键是 **(marketIndex, isLong) 两参**，不含抵押代币——
  // `PositionPricingUtils.getPositionFees` 读的就是它们（`MarketUtils.sol:1058`）。
  NEGATIVE_FUNDING_FEE_PER_SIZE: base("NEGATIVE_FUNDING_FEE_PER_SIZE"),
  POSITIVE_FUNDING_FEE_PER_SIZE: base("POSITIVE_FUNDING_FEE_PER_SIZE"),
  FUNDING_UPDATED_AT: base("FUNDING_UPDATED_AT"),
  FUNDING_FLOOR_FACTOR: base("FUNDING_FLOOR_FACTOR"),
  FUNDING_BASE_FACTOR: base("FUNDING_BASE_FACTOR"),
  MIN_FUNDING_FACTOR_PER_SECOND: base("MIN_FUNDING_FACTOR_PER_SECOND"),
  MAX_FUNDING_FACTOR_PER_SECOND: base("MAX_FUNDING_FACTOR_PER_SECOND"),
};

/**
 * ⚠️ **裸串 key**：`keccak256("NAME")`，**没有 abi.encode**。
 * 源码 `FX100Keys.sol:7`——与本文件其余全部 key 的口径不同。
 * 用错口径读到的是恒 0 的空槽位（不报错、静默假绿），所以单列一族。
 */
const rawBase = (name) => toHex(keccak256Bytes(new TextEncoder().encode(name)));

export const RAW_BASE = {
  LIQUIDATION_GRACE_PERIOD_BASE: rawBase("LIQUIDATION_GRACE_PERIOD_BASE"),
  LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER: rawBase("LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER"),
};

const hashHex = (hex) => toHex(keccak256Bytes(fromHex(hex)));

/** keccak256(abi.encode(CUMULATIVE_OPEN_COSTS, marketIndex, isLong)) */
export const cumulativeOpenCostsKey = (marketIndex, isLong) =>
  hashEncoded([
    { type: "bytes32", value: BASE.CUMULATIVE_OPEN_COSTS },
    { type: "uint256", value: marketIndex },
    { type: "bool", value: isLong },
  ]);

/** keccak256(abi.encode(OPEN_INTEREST_IN_TOKENS, marketIndex, isLong)) */
export const openInterestInTokensKey = (marketIndex, isLong) =>
  hashEncoded([
    { type: "bytes32", value: BASE.OPEN_INTEREST_IN_TOKENS },
    { type: "uint256", value: marketIndex },
    { type: "bool", value: isLong },
  ]);

/** keccak256(abi.encode(CLAIMABLE_FEE_AMOUNT, marketIndex, token, feeType)) —— 注意是三参 */
export const claimableFeeAmountKey = (marketIndex, token, feeType) =>
  hashEncoded([
    { type: "bytes32", value: BASE.CLAIMABLE_FEE_AMOUNT },
    { type: "uint256", value: marketIndex },
    { type: "address", value: token },
    { type: "bytes32", value: feeType },
  ]);

export const positionImpactPoolAmountKey = (marketIndex) =>
  hashEncoded([
    { type: "bytes32", value: BASE.POSITION_IMPACT_POOL_AMOUNT },
    { type: "uint256", value: marketIndex },
  ]);

export const positionFeeFactorKey = (marketIndex, forPositiveImpact) =>
  hashEncoded([
    { type: "bytes32", value: BASE.POSITION_FEE_FACTOR },
    { type: "uint256", value: marketIndex },
    { type: "bool", value: forPositiveImpact },
  ]);

/** 终检闸门的市场系数（IT-POS-017/018 的阈值由它推出，不许照搬夹具的 52.5e6） */
export const minCollateralFactorKey = (marketIndex) =>
  hashEncoded([
    { type: "bytes32", value: BASE.MIN_COLLATERAL_FACTOR },
    { type: "uint256", value: marketIndex },
  ]);

export const reserveFactorKey = (marketIndex) =>
  hashEncoded([
    { type: "bytes32", value: BASE.RESERVE_FACTOR },
    { type: "uint256", value: marketIndex },
  ]);

export const maxOpenInterestKey = (marketIndex, isLong) =>
  hashEncoded([
    { type: "bytes32", value: BASE.MAX_OPEN_INTEREST },
    { type: "uint256", value: marketIndex },
    { type: "bool", value: isLong },
  ]);

/**
 * FX100Keys.accountOrderListKey：keccak256(ACCOUNT_ORDER_LIST ‖ bytes32(account))。
 * ⚠️ 这是 `_efficientHash`（两个 32 字节直拼再哈希），**不是** abi.encode 口径——
 * 与本文件其余 key 的派生方式不同，照抄实现，不要「统一」成 hashEncoded。
 */
export const accountOrderListKey = (account) =>
  hashHex(BASE.ACCOUNT_ORDER_LIST + account.toLowerCase().replace(/^0x/, "").padStart(64, "0"));

/* ---------------------------------------------- 清算域 */

/** 维持保证金系数（清算判定用，与开仓闸门的 MIN_COLLATERAL_FACTOR 是两个不同的键） */
export const minCollateralFactorForLiquidationKey = (marketIndex) =>
  hashEncoded([
    { type: "bytes32", value: BASE.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION },
    { type: "uint256", value: marketIndex },
  ]);

export const liquidationFeeFactorKey = (marketIndex) =>
  hashEncoded([
    { type: "bytes32", value: BASE.LIQUIDATION_FEE_FACTOR },
    { type: "uint256", value: marketIndex },
  ]);

/** 裸串口径（见 RAW_BASE 注释） */
export const liquidationGracePeriodBaseKey = (marketIndex) =>
  hashEncoded([
    { type: "bytes32", value: RAW_BASE.LIQUIDATION_GRACE_PERIOD_BASE },
    { type: "uint256", value: marketIndex },
  ]);

export const liquidationGracePeriodTierMultiplierKey = (tier) =>
  hashEncoded([
    { type: "bytes32", value: RAW_BASE.LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER },
    { type: "uint256", value: tier },
  ]);

/** 一族「基名 + marketIndex」的键，派生方式完全一致，批量生成免得逐个抄错 */
const byMarket = (name) => (marketIndex) =>
  hashEncoded([
    { type: "bytes32", value: base(name) },
    { type: "uint256", value: marketIndex },
  ]);

/* 点差三段（配置 L0 要清零的前三个键） */
export const constantPriceSpreadKey = byMarket("CONSTANT_PRICE_SPREAD");
export const priceImpactParameterKey = byMarket("PRICE_IMPACT_PARAMETER");
export const skewImpactFactorKey = byMarket("SKEW_IMPACT_FACTOR");
export const bidOrderBookDepthKey = byMarket("BID_ORDER_BOOK_DEPTH");
export const askOrderBookDepthKey = byMarket("ASK_ORDER_BOOK_DEPTH");
/** skew 项的上下钳（int 族）——因子清零后仍会被它们夹住，L0 要一起清 */
export const minSkewImpactKey = byMarket("MIN_SKEW_IMPACT");
export const maxSkewImpactKey = byMarket("MAX_SKEW_IMPACT");

/* 资金费四键（配置 L0 要清零；L2 保持默认） */
export const fundingFloorFactorKey = byMarket("FUNDING_FLOOR_FACTOR");
export const fundingBaseFactorKey = byMarket("FUNDING_BASE_FACTOR");
export const minFundingFactorPerSecondKey = byMarket("MIN_FUNDING_FACTOR_PER_SECOND");
export const maxFundingFactorPerSecondKey = byMarket("MAX_FUNDING_FACTOR_PER_SECOND");

/* ---------------------------------------------- 价格源 */

export const priceFeedKey = (token) =>
  hashEncoded([
    { type: "bytes32", value: BASE.PRICE_FEED },
    { type: "address", value: token },
  ]);

export const priceFeedMultiplierKey = (token) =>
  hashEncoded([
    { type: "bytes32", value: BASE.PRICE_FEED_MULTIPLIER },
    { type: "address", value: token },
  ]);

export const priceFeedHeartbeatDurationKey = (token) =>
  hashEncoded([
    { type: "bytes32", value: BASE.PRICE_FEED_HEARTBEAT_DURATION },
    { type: "address", value: token },
  ]);

export const stablePriceKey = (token) =>
  hashEncoded([
    { type: "bytes32", value: BASE.STABLE_PRICE },
    { type: "address", value: token },
  ]);

/** ⚠️ 两参重载（oracle, token）——Oracle._validatePrices 走的是这个，不是单参版 */
export const oracleProviderForTokenKey = (oracle, token) =>
  hashEncoded([
    { type: "bytes32", value: BASE.ORACLE_PROVIDER_FOR_TOKEN },
    { type: "address", value: oracle },
    { type: "address", value: token },
  ]);

export const isOracleProviderEnabledKey = (provider) =>
  hashEncoded([
    { type: "bytes32", value: BASE.IS_ORACLE_PROVIDER_ENABLED },
    { type: "address", value: provider },
  ]);

/* ---------------------------------------------- 资金费 */

/**
 * 市场侧累计的**负**资金费 per-size（该方向仓位要付的）。
 * 仓位侧存着上次结算时的基准 `position.numbers.negativeFundingFeePerSize`，
 * 两者之差乘 `sizeInTokens` 就是本次要结算的额（推导见 integration/lib/funding.mjs）。
 */
export const negativeFundingFeePerSizeKey = (marketIndex, isLong) =>
  hashEncoded([
    { type: "bytes32", value: BASE.NEGATIVE_FUNDING_FEE_PER_SIZE },
    { type: "uint256", value: marketIndex },
    { type: "bool", value: isLong },
  ]);

/** 市场侧累计的**正**资金费 per-size（该方向仓位能收的） */
export const positiveFundingFeePerSizeKey = (marketIndex, isLong) =>
  hashEncoded([
    { type: "bytes32", value: BASE.POSITIVE_FUNDING_FEE_PER_SIZE },
    { type: "uint256", value: marketIndex },
    { type: "bool", value: isLong },
  ]);

export const fundingUpdatedAtKey = (marketIndex) =>
  hashEncoded([
    { type: "bytes32", value: BASE.FUNDING_UPDATED_AT },
    { type: "uint256", value: marketIndex },
  ]);

/** Position.getPositionKey: keccak256(abi.encode(account, marketIndex, isLong)) —— 无基名前缀 */
export const positionKey = (account, marketIndex, isLong) =>
  hashHex(
    abiEncode([
      { type: "address", value: account },
      { type: "uint256", value: marketIndex },
      { type: "bool", value: isLong },
    ]),
  );

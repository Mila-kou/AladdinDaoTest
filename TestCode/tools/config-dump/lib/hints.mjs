// 精度与语义提示表。仅用于报告的「可读值」列，不参与断言。
// 依据：Test/project/fx100/profile/C-合约测试约定.md §一 精度公约表。
// 提示表没覆盖到的 key，报告只给原始整数——这是刻意的：宁可不给，也不给错的换算。

export const FLOAT_PRECISION = 10n ** 30n; // USD / factor
export const WEI_PRECISION = 10n ** 18n; // spread / skew

/** key 基名 -> {scale, unit} */
export const PRECISION_HINTS = {
  // —— 1e30 factor / USD ——
  MAX_PNL_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MAX_PNL_FACTOR_FOR_TRADERS: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MAX_PNL_FACTOR_FOR_ADL: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MAX_PNL_FACTOR_FOR_WITHDRAWALS: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MIN_PNL_FACTOR_AFTER_ADL: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  RESERVE_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  POSITION_FEE_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  POSITION_FEE_RECEIVER_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  LIQUIDATION_FEE_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  LIQUIDATION_FEE_RECEIVER_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  SWAP_FEE_RECEIVER_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  BORROWING_FEE_RECEIVER_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MIN_COLLATERAL_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  POSITION_IMPACT_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  POSITION_IMPACT_EXPONENT_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MAX_POSITION_IMPACT_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MAX_OPEN_INTEREST_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  DATA_STREAM_SPREAD_REDUCTION_FACTOR: { scale: FLOAT_PRECISION, unit: "factor(1e30)" },
  MIN_POSITION_SIZE_USD: { scale: FLOAT_PRECISION, unit: "USD(1e30)" },
  MAX_POSITION_SIZE_USD: { scale: FLOAT_PRECISION, unit: "USD(1e30)" },
  MAX_OPEN_INTEREST: { scale: FLOAT_PRECISION, unit: "USD(1e30)" },
  EXECUTION_FEE_SUBSIDIZE: { scale: FLOAT_PRECISION, unit: "USD(1e30)" },
  BID_ORDER_BOOK_DEPTH: { scale: FLOAT_PRECISION, unit: "USD(1e30)" },
  ASK_ORDER_BOOK_DEPTH: { scale: FLOAT_PRECISION, unit: "USD(1e30)" },
  MIN_COLLATERAL_USD: { scale: FLOAT_PRECISION, unit: "USD(1e30)" },

  // —— 1e30 per-second 费率（乘 31_536_000 得年化）——
  FUNDING_FLOOR_FACTOR: { scale: FLOAT_PRECISION, unit: "per-sec(1e30)", annualize: true },
  FUNDING_BASE_FACTOR: { scale: FLOAT_PRECISION, unit: "per-sec(1e30)", annualize: true },
  MIN_FUNDING_FACTOR_PER_SECOND: { scale: FLOAT_PRECISION, unit: "per-sec(1e30)", annualize: true },
  MAX_FUNDING_FACTOR_PER_SECOND: { scale: FLOAT_PRECISION, unit: "per-sec(1e30)", annualize: true },

  // —— 1e18 spread / skew（与上面的 fee factor 1e30 是最高频踩坑对）——
  CONSTANT_PRICE_SPREAD: { scale: WEI_PRECISION, unit: "spread(1e18)" },
  MAX_PRICE_IMPACT_SPREAD: { scale: WEI_PRECISION, unit: "spread(1e18)" },
  PRICE_IMPACT_PARAMETER: { scale: WEI_PRECISION, unit: "spread(1e18)" },
  SKEW_IMPACT_FACTOR: { scale: WEI_PRECISION, unit: "skew(1e18)" },
  MIN_SKEW_IMPACT: { scale: WEI_PRECISION, unit: "skew(1e18)" },
  MAX_SKEW_IMPACT: { scale: WEI_PRECISION, unit: "skew(1e18)" },
  LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER: { scale: WEI_PRECISION, unit: "multiplier(1e18)" },
  EXECUTION_FEE_SUBSIDIZE_SIZE: { scale: WEI_PRECISION, unit: "token(1e18)" },

  // —— 秒 ——
  SEQUENCER_GRACE_DURATION: { unit: "seconds" },
  MAX_ORACLE_PRICE_AGE: { unit: "seconds" },
  MAX_RECORDED_PRICE_AGE: { unit: "seconds" },
  MAX_ORACLE_TIMESTAMP_RANGE: { unit: "seconds" },
  REQUEST_EXPIRATION_TIME: { unit: "seconds" },
  CLAIMABLE_COLLATERAL_DELAY: { unit: "seconds" },
  CLAIMABLE_COLLATERAL_TIME_DIVISOR: { unit: "seconds" },
  PRICE_FEED_HEARTBEAT_DURATION: { unit: "seconds" },
  LIQUIDATION_GRACE_PERIOD_BASE: { unit: "seconds" },
  ORACLE_PROVIDER_MIN_CHANGE_DELAY: { unit: "seconds" },
};

const SECONDS_PER_YEAR = 31_536_000n;

/** 原始整数 -> 可读串；无提示返回 null（不臆造换算） */
export function humanize(base, value) {
  const hint = PRECISION_HINTS[base];
  if (!hint || value === null || value === undefined) return null;
  const v = BigInt(value);

  if (!hint.scale) return `${v.toString()} ${hint.unit}`;

  const negative = v < 0n;
  const abs = negative ? -v : v;
  const whole = abs / hint.scale;
  const frac = (abs % hint.scale).toString().padStart(hint.scale.toString().length - 1, "0").replace(/0+$/, "");
  const decimal = `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;

  if (!hint.annualize) return `${decimal} (${hint.unit})`;

  const annual = (v * SECONDS_PER_YEAR * 10_000n) / hint.scale; // 年化，单位 bp
  return `${decimal} (${hint.unit}, 年化≈${(Number(annual) / 100).toFixed(4)}%)`;
}

/** 判断是否为「未设置」的默认值 */
export function isUnset(type, value) {
  if (value === null || value === undefined) return true;
  switch (type) {
    case "uint":
    case "int":
    case "uintCount":
    case "addressCount":
    case "bytes32Count":
      return BigInt(value) === 0n;
    case "bool":
      return value === false;
    case "address":
      return String(value).toLowerCase() === "0x0000000000000000000000000000000000000000";
    case "bytes32":
      return /^0x0{64}$/i.test(String(value));
    default:
      return false;
  }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {FX100Keys} from "src/constants/FX100Keys.sol";
import {Market} from "src/market/Market.sol";
import {MarketUtils} from "src/market/MarketUtils.sol";
import {Position} from "src/position/Position.sol";
import {PositionPricingUtils} from "src/pricing/PositionPricingUtils.sol";
import {PositionUtils} from "src/position/PositionUtils.sol";
import {Price} from "src/price/Price.sol";

import {Fx100Setup} from "../../fixtures/Fx100Setup.t.sol";

/// @notice UT 设计文档：TestCase/UT/case/UT-R5B02-LiquidationFeeTier.md
/// 回归对象：commit 13880f2 "fix(R5-B02): isPositionLiquidatable ignores balanceWasImproved fee tier"。
/// 修复前 cache.balanceWasImproved 从未被赋值，struct bool 字段默认值恒为 false——
/// 等价于清算可行性判定里的手续费档位选择永远按「未改善平衡」计算，与该笔清算实际的成交方向脱节。
/// 本文件不断言 dynamicSpread/executionPrice 本身（该维度已由 PositionPricing.t.sol 覆盖），
/// 只专门盯住"费率档位是否跟随 balanceWasImproved 切换"这一具体修复点。
contract LiquidationFeeTierRegressionTest is Fx100Setup {
    using Position for Position.Props;

    Market.Props internal market;

    // 与 PositionPricing.t.sol::_configureNegativeDynamicSpreadForLongDecrease / _getLongPosition 完全一致的最小数字，
    // 该组合已被现有 85/85 通过的套件证明不会在 getDecreaseOrderSize / OI 扣减处 underflow。
    uint256 internal constant SIZE_IN_USD = 100 * FLOAT_PRECISION;
    uint256 internal constant SIZE_IN_TOKENS = 1;
    uint256 internal constant COLLATERAL_AMOUNT = 10 * USDC_UNIT;

    function setUp() external {
        _deployFx100Core();
        market = reader.getMarket(dataStore, DEFAULT_MARKET_INDEX);

        // 构造 long OI 独大（=1）、short OI=0 的失衡态：清算/全平这个多头会收窄失衡，
        // 应触发 balanceWasImproved=true（见 test_BalanceWasImprovedPrecondition_IsTrue 的独立验证）。
        dataStore.setUint(FX100Keys.constantPriceSpreadKey(DEFAULT_MARKET_INDEX), 0);
        dataStore.setUint(FX100Keys.priceImpactParameterKey(DEFAULT_MARKET_INDEX), 0);
        dataStore.setInt(FX100Keys.skewImpactFactorKey(DEFAULT_MARKET_INDEX), WEI_PRECISION_I / 10);
        dataStore.setInt(FX100Keys.minSkewImpactKey(DEFAULT_MARKET_INDEX), -WEI_PRECISION_I);
        dataStore.setInt(FX100Keys.maxSkewImpactKey(DEFAULT_MARKET_INDEX), WEI_PRECISION_I);
        dataStore.setUint(FX100Keys.openInterestInTokensKey(DEFAULT_MARKET_INDEX, true), 1);
    }

    /// @notice 前置断言：证明本用例构造的 OI/仓位组合确实令 balanceWasImproved=true，
    /// 避免下面两条主用例建立在错误前提上（幽灵断言）。直接复用 isPositionLiquidatable 内部
    /// 调用 getExecutionPriceForDecrease 时同款的负 usdDelta/tokenDelta 语义（见 PositionUtils.sol L706-716）。
    function test_BalanceWasImprovedPrecondition_IsTrue() external view {
        (, bool balanceWasImproved) = PositionPricingUtils.getDynamicSpread(
            PositionPricingUtils.GetDynamicSpreadParams({
                dataStore: dataStore,
                market: market,
                indexTokenPrice: Price.Props(100 * FLOAT_PRECISION, 100 * FLOAT_PRECISION),
                usdDelta: -int256(SIZE_IN_USD),
                tokenDelta: -int256(SIZE_IN_TOKENS),
                isLong: true,
                allowNegativeSpread: true
            })
        );
        assertTrue(
            balanceWasImproved,
            "fixture must make a full-close long liquidation balance-improving, otherwise the two cases below do not test the intended branch"
        );
    }

    /// @notice R5-B02 正例：balanceWasImproved=true 时，改变「改善」档位费率必须让
    /// remainingCollateralUsd 精确变动 Δfactor×sizeInUsd/FLOAT_PRECISION。
    /// 推导：factor 0%→1%（Δ=1e28），sizeInUsd=100×1e30=1e32；
    /// Δfee = 1e32×1e28/1e30 = 1e30（=1 USD，1e30 精度），除法在 collateralTokenPrice.min=1e24 处可整除，无舍入损耗。
    function test_R5B02_UsesImprovedTierFactor_WhenBalanceIsImproved() external {
        // 未改善档刻意设为非零且与改善档不同（5%），若判定误用该档，下面的差值断言会失败。
        _setConfigUint(FX100Keys.POSITION_FEE_FACTOR, abi.encode(DEFAULT_MARKET_INDEX, false), 5 * FLOAT_PRECISION / 100);
        _setConfigUint(FX100Keys.POSITION_FEE_FACTOR, abi.encode(DEFAULT_MARKET_INDEX, true), 0);
        (,, PositionUtils.IsPositionLiquidatableInfo memory infoA) = _isLiquidatable();

        _setConfigUint(FX100Keys.POSITION_FEE_FACTOR, abi.encode(DEFAULT_MARKET_INDEX, true), FLOAT_PRECISION / 100);
        (,, PositionUtils.IsPositionLiquidatableInfo memory infoB) = _isLiquidatable();

        int256 expectedDelta = int256(FLOAT_PRECISION); // 1 USD（1e30 精度）
        assertEq(
            infoA.remainingCollateralUsd - infoB.remainingCollateralUsd,
            expectedDelta,
            "remainingCollateralUsd must move by exactly the improved-tier fee delta"
        );
    }

    /// @notice R5-B02 反例：这是修复前 bug 的直接特征——balanceWasImproved=true 时，
    /// 改变「未改善」档位费率必须对 remainingCollateralUsd 零影响；若判定仍隐式按 false 档位计费
    /// （修复前 cache.balanceWasImproved 从未赋值、恒为 false），本用例会检测到非零差值而失败。
    function test_R5B02_IgnoresStandardTierFactor_WhenBalanceIsImproved() external {
        _setConfigUint(FX100Keys.POSITION_FEE_FACTOR, abi.encode(DEFAULT_MARKET_INDEX, true), 0);
        _setConfigUint(FX100Keys.POSITION_FEE_FACTOR, abi.encode(DEFAULT_MARKET_INDEX, false), 0);
        (,, PositionUtils.IsPositionLiquidatableInfo memory infoA) = _isLiquidatable();

        _setConfigUint(FX100Keys.POSITION_FEE_FACTOR, abi.encode(DEFAULT_MARKET_INDEX, false), FLOAT_PRECISION / 100);
        (,, PositionUtils.IsPositionLiquidatableInfo memory infoB) = _isLiquidatable();

        assertEq(
            infoA.remainingCollateralUsd,
            infoB.remainingCollateralUsd,
            "remainingCollateralUsd must NOT react to the standard-tier factor when balance was improved"
        );
    }

    function _isLiquidatable()
        internal
        view
        returns (bool isLiquidatable, string memory reason, PositionUtils.IsPositionLiquidatableInfo memory info)
    {
        return PositionUtils.isPositionLiquidatable(
            dataStore,
            referralStorage,
            _position(),
            market,
            MarketUtils.MarketPrices({
                indexTokenPrice: Price.Props(100 * FLOAT_PRECISION, 100 * FLOAT_PRECISION),
                collateralTokenPrice: Price.Props(FLOAT_PRECISION / USDC_UNIT, FLOAT_PRECISION / USDC_UNIT)
            }),
            false,
            true
        );
    }

    function _position() internal view returns (Position.Props memory position) {
        position.setAccount(trader);
        position.setMarketIndex(DEFAULT_MARKET_INDEX);
        position.setSizeInUsd(SIZE_IN_USD);
        position.setSizeInTokens(SIZE_IN_TOKENS);
        position.setCollateralAmount(COLLATERAL_AMOUNT);
        position.setIsLong(true);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {FX100Keys} from "src/constants/FX100Keys.sol";
import {FxErrors} from "src/error/FxErrors.sol";
import {Market} from "src/market/Market.sol";
import {PositionPricingUtils} from "src/pricing/PositionPricingUtils.sol";
import {Price} from "src/price/Price.sol";

import {Fx100Setup} from "../../fixtures/Fx100Setup.t.sol";

/// @notice UT 设计文档：TestCase/UT/case/UT-B32-01-DynamicSpreadClamp.md（六字段与期望值推导以该文档为准）。
/// 覆盖 v0.3.2 新增功能「MIN/MAX_DYNAMIC_SPREAD int256 clamp」的边界：
/// 升级漏配、三点钳制（阈值前/等于/越过）、Config 写入权限与无范围校验。
/// 主副本维护于工作区 TestCode/unit/src/（脱离 Github/ 供应商克隆），执行前由 TestCode/unit/sync.mjs
/// 同步进当前合约 worktree 的 test/integration/ut-custom/ 后再跑 forge test。
contract DynamicSpreadClampBoundaryTest is Fx100Setup {
    Market.Props internal market;

    // 05-重要参数边界场景.md §1.5 公共 fixture 下的 rawSpread：
    // 常数点差 1e14 + priceImpactSpread(线性项 1e15/100=1e13) + skewImpact(隔离为 0) = 1.1e14
    int256 internal constant RAW_SPREAD = 110_000_000_000_000;

    function setUp() external {
        _deployFx100Core();
        market = reader.getMarket(dataStore, DEFAULT_MARKET_INDEX);
        _configureGroup1Fixture();
    }

    // ------------------------------------------------------------------
    // B32-1-01：MIN/MAX_DYNAMIC_SPREAD 两键未配置（升级漏配事故）→ dynamicSpread 恒为 0
    // 推导：Calc.clamp(1.1e14, 0, 0)，value(1.1e14) > max(0) → 返回 max = 0。
    // ------------------------------------------------------------------
    function test_B32_1_01_ClampKeysUnconfigured_SpreadForcedToZero() external {
        // _deployFx100Core 默认市场已配置 min=-2e16/max=1e18，这里显式清零两键，
        // 模拟「目标市场未执行 configureMarket 对这两键的写入循环」这一升级漏配场景。
        dataStore.setInt(FX100Keys.minDynamicSpreadKey(DEFAULT_MARKET_INDEX, true), 0);
        dataStore.setInt(FX100Keys.maxDynamicSpreadKey(DEFAULT_MARKET_INDEX, true), 0);

        (int256 dynamicSpread,) = _getRawDynamicSpread();
        assertEq(dynamicSpread, 0, "unconfigured (zeroed) clamp keys must force dynamicSpread to 0");
    }

    // ------------------------------------------------------------------
    // B32-1-03：MIN_DYNAMIC_SPREAD 三点钳制（阈值前/等于/越过），max 固定为不生效的 1e18
    // ------------------------------------------------------------------
    function test_B32_1_03_P1_MinBelowRaw_NotClamped() external {
        _setMinMax(RAW_SPREAD - 1, 1e18);
        assertEq(_rawSpreadValue(), RAW_SPREAD, "raw >= min, must not be clamped");
    }

    function test_B32_1_03_P2_MinEqualsRaw_NotClamped() external {
        _setMinMax(RAW_SPREAD, 1e18);
        assertEq(_rawSpreadValue(), RAW_SPREAD, "raw == min, equality side is not clamping");
    }

    function test_B32_1_03_P3_MinAboveRaw_ClampedUpToMin() external {
        _setMinMax(RAW_SPREAD + 1, 1e18);
        assertEq(_rawSpreadValue(), RAW_SPREAD + 1, "raw < min, must be lifted to min");
    }

    // ------------------------------------------------------------------
    // B32-1-04：MAX_DYNAMIC_SPREAD 三点钳顶，min 固定为不生效的 -2e16
    // ------------------------------------------------------------------
    function test_B32_1_04_P1_MaxAboveRaw_NotClamped() external {
        _setMinMax(-2e16, RAW_SPREAD + 1);
        assertEq(_rawSpreadValue(), RAW_SPREAD, "raw <= max, must not be clamped");
    }

    function test_B32_1_04_P2_MaxEqualsRaw_NotClamped() external {
        _setMinMax(-2e16, RAW_SPREAD);
        assertEq(_rawSpreadValue(), RAW_SPREAD, "raw == max, equality side is not clamping");
    }

    function test_B32_1_04_P3_MaxBelowRaw_ClampedDownToMax() external {
        _setMinMax(-2e16, RAW_SPREAD - 1);
        assertEq(_rawSpreadValue(), RAW_SPREAD - 1, "raw > max, must be pulled down to max");
    }

    // ------------------------------------------------------------------
    // B32-1-09：clamp 键写入权限（K1 CONFIG_KEEPER / K2 LIMITED_CONFIG_KEEPER / K3 无角色）+ 无范围校验
    // ------------------------------------------------------------------
    function test_B32_1_09_K3_NoRole_Reverts() external {
        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(FxErrors.Unauthorized.selector, trader, bytes32("LIMITED / CONFIG KEEPER"))
        );
        config.setInt(FX100Keys.MIN_DYNAMIC_SPREAD, abi.encode(DEFAULT_MARKET_INDEX, true), -2e16);
    }

    function test_B32_1_09_K2_LimitedConfigKeeper_Reverts() external {
        vm.prank(limitedConfigKeeper);
        vm.expectRevert(abi.encodeWithSelector(FxErrors.InvalidBaseKey.selector, FX100Keys.MIN_DYNAMIC_SPREAD));
        config.setInt(FX100Keys.MIN_DYNAMIC_SPREAD, abi.encode(DEFAULT_MARKET_INDEX, true), -2e16);
    }

    function test_B32_1_09_K1_ConfigKeeper_NormalValue_Succeeds() external {
        vm.prank(configKeeper);
        config.setInt(FX100Keys.MIN_DYNAMIC_SPREAD, abi.encode(DEFAULT_MARKET_INDEX, true), -2e16);

        assertEq(dataStore.getInt(FX100Keys.minDynamicSpreadKey(DEFAULT_MARKET_INDEX, true)), -2e16);
    }

    function test_B32_1_09_K1_ConfigKeeper_ExtremeValueNoRangeCheck_Succeeds() external {
        // -1e18 = -100%，业务上不合理，但 Config.setInt 只做 onlyKeeper + _validateKey，无 validateRange。
        int256 extremeValue = -1e18;
        vm.prank(configKeeper);
        config.setInt(FX100Keys.MIN_DYNAMIC_SPREAD, abi.encode(DEFAULT_MARKET_INDEX, true), extremeValue);

        assertEq(dataStore.getInt(FX100Keys.minDynamicSpreadKey(DEFAULT_MARKET_INDEX, true)), extremeValue);
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------
    function _configureGroup1Fixture() internal {
        dataStore.setUint(FX100Keys.constantPriceSpreadKey(DEFAULT_MARKET_INDEX), 100_000_000_000_000); // 1e14 = 0.01%
        dataStore.setUint(FX100Keys.priceImpactParameterKey(DEFAULT_MARKET_INDEX), 600_000_000_000_000_000); // 6e17 = 0.6
        dataStore.setUint(FX100Keys.bidOrderBookDepthKey(DEFAULT_MARKET_INDEX), 1e37); // 10,000,000 USD 深度
        dataStore.setUint(FX100Keys.askOrderBookDepthKey(DEFAULT_MARKET_INDEX), 1e37);
        dataStore.setUint(FX100Keys.MAX_PRICE_IMPACT_SPREAD, 5_000_000_000_000_000); // 5e15 = 0.5%（本组数值远小于此，不生效）
        dataStore.setInt(FX100Keys.skewImpactFactorKey(DEFAULT_MARKET_INDEX), 0); // 隔离 skew 分支，专注 clamp 本身
        dataStore.setInt(FX100Keys.minSkewImpactKey(DEFAULT_MARKET_INDEX), -5_000_000_000_000_000);
        dataStore.setInt(FX100Keys.maxSkewImpactKey(DEFAULT_MARKET_INDEX), 5_000_000_000_000_000);
    }

    function _setMinMax(int256 min, int256 max) internal {
        dataStore.setInt(FX100Keys.minDynamicSpreadKey(DEFAULT_MARKET_INDEX, true), min);
        dataStore.setInt(FX100Keys.maxDynamicSpreadKey(DEFAULT_MARKET_INDEX, true), max);
    }

    function _rawSpreadValue() internal view returns (int256) {
        (int256 dynamicSpread,) = _getRawDynamicSpread();
        return dynamicSpread;
    }

    function _getRawDynamicSpread() internal view returns (int256, bool) {
        return PositionPricingUtils.getDynamicSpread(
            PositionPricingUtils.GetDynamicSpreadParams({
                dataStore: dataStore,
                market: market,
                indexTokenPrice: Price.Props(100 * FLOAT_PRECISION, 100 * FLOAT_PRECISION),
                usdDelta: int256(10_000 * FLOAT_PRECISION), // 基准开多单：10,000 USD（05 文档 §1.5 基准订单）
                tokenDelta: int256(100 * WEI_PRECISION),
                isLong: true,
                allowNegativeSpread: true
            })
        );
    }
}

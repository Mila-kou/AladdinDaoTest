// 清理 fork 上的残仓（运维工具）。
// 场景：数据集矩阵运行被网络中断等打断，finally 里的 evm_revert 未执行，trader 在 default-mock 市场留下仓位，
// 之后 runMarketFlow 的「执行前无多/空仓」前置检查直接失败。本脚本按 runner 同一路径平掉多/空残仓，
// 仅支持 mock-market + Inline Keeper；不打印任何 RPC URL 或私钥。
// 用法：E2E_ENV=tx-fork E2E_ENV_PRIORITY_KEYS=E2E_ENV npm run env:close:residual
import { loadRuntimeConfig } from '../src/config/runtime.js';
import { closeResidualPosition } from '../src/scenarios/scn-009-runner.js';

const runtime = loadRuntimeConfig();
console.log(`环境 ${runtime.environment}（chainId ${runtime.chainId}）· 签名 ${runtime.signingMode} · Keeper ${runtime.keeperMode}`);
for (const isLong of [true, false]) {
  const result = await closeResidualPosition(runtime, { isLong });
  const side = isLong ? '多' : '空';
  if (!result.closed) {
    console.log(`[${side}] 无残仓（market #${result.marketIndex}）`);
    continue;
  }
  console.log(`[${side}] 已平掉残仓 market #${result.marketIndex}：sizeInUsd=${result.sizeInUsd} collateral=${result.collateralAmount}`);
  console.log(`  创建全平单 tx=${result.createTxHash} block=${result.createBlock} orderKey=${result.orderKey}`);
  console.log(`  Keeper 执行 tx=${result.executeTxHash} block=${result.executeBlock}`);
  console.log(`  平仓后仓位存在=${result.positionAfter}`);
}

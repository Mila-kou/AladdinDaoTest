// 部署产物加载：地址表 + 链上常量。
// 地址一律从 deployed_addresses.json 读，禁止在脚本里裸写（附录 C §三.3 的链上版）。

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// 默认部署产物：合约仓库内的 base_sepolia_v0.3.1_260729
export const DEFAULT_DEPLOYMENT = resolve(
  HERE,
  "../../../../../../Github/fx100-contracts@release-v0.3.1/base_sepolia_v0.3.1_260729",
);

// Base Sepolia 原生 WNT（不在部署产物里——它是链自带的 predeploy）
export const WNT = "0x4200000000000000000000000000000000000006";

export const CHAIN_ID = 84532;
export const EXPLORER = "https://sepolia.basescan.org";

// 部署产物键名 → 脚本内短名。同地址别名（DataStore/DataStoreProxy）只取一个。
const WANTED = {
  dataStore: "Fx100Base#DataStore",
  router: "Fx100Base#Router",
  exchangeRouter: "Fx100Execution#ExchangeRouter",
  orderHandler: "Fx100Execution#OrderHandler",
  orderVault: "Fx100Base#OrderVault",
  positionVault: "Fx100Base#PositionVault",
  lpVault: "Fx100Base#LPVault",
  feeHandler: "Fx100Execution#FeeHandler",
  usdc: "Fx100Usdc#MockUSDC",
  reader: "Fx100Periphery#Reader",
  oracle: "Fx100Base#Oracle",
  eventEmitter: "Fx100Base#EventEmitter",
  // 清算 / ADL 域（IT-LIQ-* · IT-ADL-*）
  liquidationHandler: "Fx100Execution#LiquidationHandler",
  adlHandler: "Fx100Execution#AdlHandler",
  referralStorage: "Fx100Base#ReferralStorage",
  config: "Fx100Base#Config",
  // fork 上把价格改指到可控 mock 时要用（见 integration/lib/domainfork.mjs）
  chainlinkPriceFeedProvider: "Fx100Oracle#ChainlinkPriceFeedProvider",
  chainlinkDataStreamProvider: "Fx100Oracle#ChainlinkDataStreamProvider",
};

/**
 * 加载部署地址表。
 * @param {string} deploymentDir 部署产物目录（含 deployed_addresses.json）
 */
export function loadDeployment(deploymentDir = DEFAULT_DEPLOYMENT) {
  const path = resolve(deploymentDir, "deployed_addresses.json");
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`读不到部署产物 ${path}：${error.message}`);
  }

  const addresses = {};
  const missing = [];
  for (const [short, key] of Object.entries(WANTED)) {
    const value = raw[key];
    if (!value) missing.push(key);
    else addresses[short] = value.toLowerCase();
  }
  // 地址缺失就是配置错，绝不静默用 undefined 继续发交易
  if (missing.length) {
    throw new Error(`部署产物缺少条目：${missing.join(", ")}（换部署时先核对键名）`);
  }

  addresses.wnt = WNT;
  return {
    name: deploymentDir.split("/").filter(Boolean).pop(),
    dir: deploymentDir,
    addresses,
    raw,
  };
}

/**
 * RPC URL 脱敏：只留主机名。
 * Tenderly / Alchemy / Infura 这类 URL 把 API key 嵌在路径里，
 * 整条打进终端或日志就等于泄了 key——所有对外输出一律走这里。
 */
export function redactUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname && u.pathname !== "/" ? `${u.host}/…` : u.host;
  } catch {
    return "(URL 解不出)";
  }
}

/** 地址 → 名字，用于账本 CSV 与报告里的可读标注 */
export function nameOf(deployment, address) {
  const target = String(address).toLowerCase();
  for (const [short, value] of Object.entries(deployment.addresses)) {
    if (value === target) return short;
  }
  for (const [key, value] of Object.entries(deployment.raw)) {
    if (String(value).toLowerCase() === target) return key;
  }
  return "EOA/外部地址";
}

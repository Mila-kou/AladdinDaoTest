import type { Address, Hash, Hex } from 'viem';

export interface ForkController {
  captureBaseline(): Promise<string>;
  resetToBaseline(baselineId: string): Promise<void>;
  setNextBlockTimestamp(timestamp: bigint): Promise<void>;
  increaseTime(seconds: bigint): Promise<void>;
  mineBlock(): Promise<Hash>;
  setNativeBalance(account: Address, amount: bigint): Promise<void>;
  setStorageAt(contract: Address, slot: Hex, value: Hex): Promise<void>;
}

export type OracleMode = 'normal' | 'stale' | 'freeze' | 'revert';

export interface OraclePriceInput {
  readonly token: Address;
  readonly min: bigint;
  readonly max: bigint;
  readonly timestamp: bigint;
}

export interface OracleController {
  setPrice(input: OraclePriceInput): Promise<Hash | void>;
  setMode(token: Address, mode: OracleMode): Promise<Hash | void>;
  restore(): Promise<void>;
}

export interface ProtocolReader {
  readMarket(marketIndex: bigint): Promise<unknown>;
  readPosition(account: Address, marketIndex: bigint, isLong: boolean): Promise<unknown>;
  readOrder(orderKey: Hex): Promise<unknown>;
  readFundingState(marketIndex: bigint): Promise<unknown>;
}

export interface KeeperController {
  executeOrder(orderKey: Hex): Promise<Hash>;
  executeLiquidation(positionKey: Hex): Promise<Hash>;
  executeAdl(positionKey: Hex, sizeDeltaUsd: bigint): Promise<Hash>;
}

// 这些接口只定义环境能力，不包含业务测试实现。具体 RPC 方法、ABI 调用和
// Tenderly API 接入要在地址、ABI、角色与 Mock Oracle 方案确认后实现。

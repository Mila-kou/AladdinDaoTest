import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { parseUnits } from 'viem';
import { z } from 'zod';

import {
  readFundingSignerCandidates,
  readTelegramNotificationConfiguration,
} from './environment-configuration.js';
import {
  BASE_SEPOLIA_FAUCET_ACCOUNT,
  BASE_SEPOLIA_FAUCET_TOKEN,
  FaucetBalanceMonitor,
} from './faucet-monitor.js';
import { type UsdcFundingReceipt, UsdcFundingManager } from './usdc-funding.js';

const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
const POLL_INTERVAL_MS = 30_000;
const FUNDING_COOLDOWN_MS = 5 * 60_000;

const updateSchema = z.object({
  enabled: z.boolean(),
  threshold: z.string().trim().min(1).max(60).regex(DECIMAL_AMOUNT, '告警阈值必须是最多 6 位小数的十进制数。'),
  targetBalance: z.string().trim().min(1).max(60).regex(DECIMAL_AMOUNT, '目标余额必须是最多 6 位小数的十进制数。'),
});

interface StoredConfiguration {
  readonly version: 1;
  readonly enabled: boolean;
  readonly threshold: string;
  readonly targetBalance: string;
  readonly pollIntervalSeconds: 30;
  readonly cooldownSeconds: 300;
  readonly updatedAt: string;
}

type ServiceState = 'STOPPED' | 'SCHEDULED' | 'CHECKING' | 'HEALTHY' | 'LOW_BALANCE' | 'FUNDING' | 'ERROR';

export interface FaucetAutoFundingStatus {
  readonly enabled: boolean;
  readonly state: ServiceState;
  readonly threshold: string;
  readonly targetBalance: string;
  readonly pollIntervalSeconds: number;
  readonly cooldownSeconds: number;
  readonly ownerKeyConfigured: boolean;
  readonly telegramConfigured: boolean;
  readonly faucet: string;
  readonly token: string;
  readonly lastCheckedAt?: string;
  readonly nextCheckAt?: string;
  readonly lastBalance?: string;
  readonly lastBlockNumber?: string;
  readonly lastFunding?: UsdcFundingReceipt;
  readonly lastError?: string;
}

interface AuditEvent {
  readonly type: 'SERVICE_UPDATED' | 'BALANCE_CHECKED' | 'LOW_BALANCE' | 'FUNDING_SUCCESS' | 'FUNDING_FAILED' | 'RECOVERED' | 'NOTIFICATION_SENT' | 'NOTIFICATION_FAILED';
  readonly at: string;
  readonly detail: Record<string, unknown>;
}

const defaultConfiguration: StoredConfiguration = {
  version: 1,
  enabled: false,
  threshold: '0',
  targetBalance: '0',
  pollIntervalSeconds: 30,
  cooldownSeconds: 300,
  updatedAt: new Date(0).toISOString(),
};

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class FaucetAutoFundingManager {
  private readonly projectRoot: string;
  private readonly configurationPath: string;
  private readonly auditPath: string;
  private readonly monitor: FaucetBalanceMonitor;
  private readonly funding: UsdcFundingManager;
  private configuration: StoredConfiguration = defaultConfiguration;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private serviceState: ServiceState = 'STOPPED';
  private lowBalanceIncident = false;
  private lastFundingAttemptAt = 0;
  private lastCheckedAt: string | undefined;
  private nextCheckAt: string | undefined;
  private lastBalance: string | undefined;
  private lastBlockNumber: string | undefined;
  private lastFunding: UsdcFundingReceipt | undefined;
  private lastError: string | undefined;

  private constructor(
    projectRoot: string,
    monitor: FaucetBalanceMonitor,
    funding: UsdcFundingManager,
  ) {
    this.projectRoot = resolve(projectRoot);
    this.configurationPath = join(this.projectRoot, 'config', 'faucet-auto-funding.json');
    this.auditPath = join(this.projectRoot, 'artifacts', 'faucet-auto-funding', 'events.jsonl');
    this.monitor = monitor;
    this.funding = funding;
  }

  static async create(
    projectRoot: string,
    monitor: FaucetBalanceMonitor,
    funding: UsdcFundingManager,
  ): Promise<FaucetAutoFundingManager> {
    const manager = new FaucetAutoFundingManager(projectRoot, monitor, funding);
    manager.configuration = await manager.readConfiguration();
    if (manager.configuration.enabled) manager.schedule(0);
    return manager;
  }

  async status(): Promise<FaucetAutoFundingStatus> {
    const [signers, telegram] = await Promise.all([
      readFundingSignerCandidates(this.projectRoot),
      readTelegramNotificationConfiguration(this.projectRoot),
    ]);
    return {
      enabled: this.configuration.enabled,
      state: this.serviceState,
      threshold: this.configuration.threshold,
      targetBalance: this.configuration.targetBalance,
      pollIntervalSeconds: this.configuration.pollIntervalSeconds,
      cooldownSeconds: this.configuration.cooldownSeconds,
      ownerKeyConfigured: signers.some((candidate) => candidate.source === 'E2E_TOKEN_OWNER_PRIVATE_KEY'),
      telegramConfigured: telegram.configured,
      faucet: BASE_SEPOLIA_FAUCET_ACCOUNT,
      token: BASE_SEPOLIA_FAUCET_TOKEN,
      ...(this.lastCheckedAt ? { lastCheckedAt: this.lastCheckedAt } : {}),
      ...(this.nextCheckAt ? { nextCheckAt: this.nextCheckAt } : {}),
      ...(this.lastBalance ? { lastBalance: this.lastBalance } : {}),
      ...(this.lastBlockNumber ? { lastBlockNumber: this.lastBlockNumber } : {}),
      ...(this.lastFunding ? { lastFunding: this.lastFunding } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  async update(rawInput: unknown): Promise<FaucetAutoFundingStatus> {
    const input = updateSchema.parse(rawInput);
    const snapshot = input.enabled ? await this.monitor.read() : undefined;
    const thresholdRaw = parseUnits(input.threshold, snapshot?.decimals ?? 6);
    const targetRaw = parseUnits(input.targetBalance, snapshot?.decimals ?? 6);
    if (thresholdRaw <= 0n) throw new Error('告警阈值必须大于 0。');
    if (targetRaw <= thresholdRaw) throw new Error('目标余额必须大于告警阈值。');

    if (input.enabled) {
      const [signers, telegram] = await Promise.all([
        readFundingSignerCandidates(this.projectRoot),
        readTelegramNotificationConfiguration(this.projectRoot),
      ]);
      if (!signers.some((candidate) => candidate.source === 'E2E_TOKEN_OWNER_PRIVATE_KEY')) {
        throw new Error('启动自动打款前必须在 Base Sepolia 环境配置 Token Owner 私钥。');
      }
      if (!telegram.configured) {
        throw new Error('启动自动打款前必须配置 Telegram Bot Token 和 Chat ID。');
      }
      await this.funding.validateBaseSepoliaAutoFunding(BASE_SEPOLIA_FAUCET_TOKEN);
    }

    this.configuration = {
      version: 1,
      enabled: input.enabled,
      threshold: input.threshold,
      targetBalance: input.targetBalance,
      pollIntervalSeconds: 30,
      cooldownSeconds: 300,
      updatedAt: new Date().toISOString(),
    };
    await this.writeConfiguration();
    await this.audit({
      type: 'SERVICE_UPDATED',
      at: new Date().toISOString(),
      detail: {
        enabled: input.enabled,
        threshold: input.threshold,
        targetBalance: input.targetBalance,
      },
    });
    this.lastError = undefined;
    if (input.enabled) this.schedule(0);
    else this.stop();
    return this.status();
  }

  runNow(): Promise<void> {
    if (!this.configuration.enabled) return Promise.reject(new Error('自动打款服务尚未启动。'));
    if (this.inFlight) return this.inFlight;
    this.clearTimer();
    this.inFlight = this.checkAndFund().finally(() => {
      this.inFlight = undefined;
      if (this.configuration.enabled) this.schedule(POLL_INTERVAL_MS);
      else this.serviceState = 'STOPPED';
    });
    return this.inFlight;
  }

  private async readConfiguration(): Promise<StoredConfiguration> {
    try {
      const parsed = JSON.parse(await readFile(this.configurationPath, 'utf8')) as Partial<StoredConfiguration>;
      const input = updateSchema.parse({
        enabled: parsed.enabled ?? false,
        threshold: parsed.threshold ?? '0',
        targetBalance: parsed.targetBalance ?? '0',
      });
      return {
        version: 1,
        enabled: input.enabled,
        threshold: input.threshold,
        targetBalance: input.targetBalance,
        pollIntervalSeconds: 30,
        cooldownSeconds: 300,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'ENOENT') return defaultConfiguration;
      throw error;
    }
  }

  private async writeConfiguration(): Promise<void> {
    await mkdir(dirname(this.configurationPath), { recursive: true });
    const temporaryPath = `${this.configurationPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.configuration, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.configurationPath);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.nextCheckAt = undefined;
  }

  private stop(): void {
    this.clearTimer();
    this.serviceState = 'STOPPED';
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    if (!this.configuration.enabled) return;
    if (this.serviceState === 'STOPPED') this.serviceState = 'SCHEDULED';
    this.nextCheckAt = new Date(Date.now() + delayMs).toISOString();
    this.timer = setTimeout(() => void this.runNow().catch(() => undefined), delayMs);
    this.timer.unref();
  }

  private async checkAndFund(): Promise<void> {
    this.serviceState = 'CHECKING';
    try {
      const snapshot = await this.monitor.read();
      this.lastCheckedAt = snapshot.checkedAt;
      this.lastBalance = snapshot.balance;
      this.lastBlockNumber = snapshot.blockNumber;
      this.lastError = undefined;
      await this.audit({
        type: 'BALANCE_CHECKED',
        at: snapshot.checkedAt,
        detail: { balance: snapshot.balance, blockNumber: snapshot.blockNumber },
      });

      const balanceRaw = BigInt(snapshot.rawBalance);
      const thresholdRaw = parseUnits(this.configuration.threshold, snapshot.decimals);
      const targetRaw = parseUnits(this.configuration.targetBalance, snapshot.decimals);
      if (balanceRaw >= thresholdRaw) {
        this.serviceState = 'HEALTHY';
        if (this.lowBalanceIncident) {
          await this.audit({
            type: 'RECOVERED',
            at: snapshot.checkedAt,
            detail: { balance: snapshot.balance, blockNumber: snapshot.blockNumber },
          });
          await this.notify(
            `FX100 Faucet 余额已恢复\n当前余额：${snapshot.balance} ${snapshot.symbol}\n区块：${snapshot.blockNumber}`,
            'RECOVERED',
          );
          this.lowBalanceIncident = false;
        }
        return;
      }

      this.serviceState = 'LOW_BALANCE';
      if (!this.lowBalanceIncident) {
        this.lowBalanceIncident = true;
        await this.audit({
          type: 'LOW_BALANCE',
          at: snapshot.checkedAt,
          detail: {
            balance: snapshot.balance,
            threshold: this.configuration.threshold,
            blockNumber: snapshot.blockNumber,
          },
        });
        await this.notify(
          `FX100 Base Sepolia Faucet 低余额告警\nFaucet：${snapshot.account}\nToken：${snapshot.token}\n当前余额：${snapshot.balance} ${snapshot.symbol}\n告警阈值：${this.configuration.threshold} ${snapshot.symbol}\n区块：${snapshot.blockNumber}`,
          'LOW_BALANCE',
        );
      }

      if (Date.now() - this.lastFundingAttemptAt < FUNDING_COOLDOWN_MS) return;
      const amountRaw = targetRaw - balanceRaw;
      if (amountRaw <= 0n) return;
      const scale = 10n ** BigInt(snapshot.decimals);
      const whole = amountRaw / scale;
      const fraction = (amountRaw % scale).toString().padStart(snapshot.decimals, '0').replace(/0+$/, '');
      const amount = `${whole}${fraction ? `.${fraction}` : ''}`;
      this.lastFundingAttemptAt = Date.now();
      this.serviceState = 'FUNDING';
      try {
        const receipt = await this.funding.fund({
          environment: 'base-sepolia',
          account: BASE_SEPOLIA_FAUCET_ACCOUNT,
          expectedToken: BASE_SEPOLIA_FAUCET_TOKEN,
          amount,
        });
        this.lastFunding = receipt;
        this.lastBalance = receipt.after;
        this.serviceState = 'HEALTHY';
        this.lowBalanceIncident = false;
        await this.audit({
          type: 'FUNDING_SUCCESS',
          at: receipt.executedAt,
          detail: {
            before: receipt.before,
            amount: receipt.amount,
            after: receipt.after,
            transactionHash: receipt.transactionHash,
          },
        });
        await this.notify(
          `FX100 Faucet 自动补款成功\nBefore：${receipt.before} ${receipt.symbol}\n补款：+${receipt.amount} ${receipt.symbol}\nAfter：${receipt.after} ${receipt.symbol}\n交易：${receipt.transactionUrl ?? receipt.transactionHash ?? '无链接'}`,
          'FUNDING_SUCCESS',
        );
      } catch (error) {
        this.serviceState = 'ERROR';
        this.lastError = safeError(error);
        await this.audit({
          type: 'FUNDING_FAILED',
          at: new Date().toISOString(),
          detail: { error: this.lastError },
        });
        await this.notify(
          `FX100 Faucet 自动补款失败\n余额：${snapshot.balance} ${snapshot.symbol}\n原因：${this.lastError}`,
          'FUNDING_FAILED',
        );
      }
    } catch (error) {
      this.serviceState = 'ERROR';
      this.lastError = safeError(error);
      await this.audit({
        type: 'FUNDING_FAILED',
        at: new Date().toISOString(),
        detail: { stage: 'balance-check', error: this.lastError },
      });
    }
  }

  private async notify(message: string, auditType: AuditEvent['type']): Promise<void> {
    const telegram = await readTelegramNotificationConfiguration(this.projectRoot);
    if (!telegram.configured || !telegram.botToken || !telegram.chatId) {
      this.lastError = 'Telegram 通知失败：Bot Token 或 Chat ID 未配置。';
      await this.audit({
        type: 'NOTIFICATION_FAILED',
        at: new Date().toISOString(),
        detail: { notificationType: auditType, error: this.lastError },
      });
      return;
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: telegram.chatId, text: message, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json() as { ok?: boolean; description?: string };
      if (!response.ok || !body.ok) throw new Error(body.description ?? `Telegram HTTP ${response.status}`);
      await this.audit({
        type: 'NOTIFICATION_SENT',
        at: new Date().toISOString(),
        detail: { notificationType: auditType },
      });
    } catch (error) {
      await this.audit({
        type: 'NOTIFICATION_FAILED',
        at: new Date().toISOString(),
        detail: { notificationType: auditType, error: safeError(error) },
      });
      // 通知失败不能阻止已经授权的自动补款，但必须保留错误供看板显示。
      const notificationError = `Telegram 通知失败：${safeError(error)}`;
      this.lastError = this.lastError ? `${this.lastError}；${notificationError}` : notificationError;
    }
  }

  private async audit(event: AuditEvent): Promise<void> {
    await mkdir(dirname(this.auditPath), { recursive: true });
    await appendFile(this.auditPath, `${JSON.stringify(event)}\n`, 'utf8');
  }
}

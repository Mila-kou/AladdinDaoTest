/**
 * Trader 花名册重生成（真实 EOA）：npm run traders:generate [-- --count 100] [-- --force]
 *
 * 直接调 NoiseTradeManager.generateWallets({ count, mode: 'mnemonic' })：
 *   - 私钥束写 config/noise-traders.secret.json（0600、gitignore、仅本机）；
 *   - 公开地址册同步写 config/noise-traders.json + .csv（source: wallet，入 gitignore 的本机文件）。
 *
 * 保密纪律：本脚本输出只含 count / mode / mnemonicWords / 文件路径 / 首尾地址，
 * 绝不打印私钥或助记词；私钥束已存在且未加 --force 时拒绝覆盖（覆盖会作废旧地址）。
 */
import { NoiseTradeManager } from '../src/server/noise-trades.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const count = Number(argument('--count') ?? '100');
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('--count 必须是 1–100 的整数。');
  }
  const force = process.argv.includes('--force');
  const manager = new NoiseTradeManager(process.cwd());
  const status = await manager.walletSecretStatus();
  if (status.exists && !force) {
    console.error(
      `私钥束 config/noise-traders.secret.json 已存在（${status.count ?? '?'} 个钱包，`
      + `mode=${status.mode ?? '未知'}，generatedAt=${status.generatedAt ?? '未知'}）。`,
    );
    console.error('覆盖会作废旧地址（及其链上资产与 case-traders.json 映射）：请先备份该文件或其助记词，确认后加 --force 重跑。');
    process.exit(1);
  }
  const result = await manager.generateWallets({ count, mode: 'mnemonic' });
  const first = result.roster[0];
  const last = result.roster.at(-1);
  console.log(JSON.stringify({
    count: result.roster.length,
    mode: result.mode,
    ...(result.mnemonicWords === undefined ? {} : { mnemonicWords: result.mnemonicWords }),
    generatedAt: result.generatedAt,
    secretPath: result.secretPath,
    rosterJson: result.paths.json,
    rosterCsv: result.paths.csv,
    firstAddress: first?.address ?? null,
    lastAddress: last?.address ?? null,
  }, null, 2));
  console.log('私钥束仅存本机（0600、gitignore）；备份助记词即可完全恢复整批钱包。下一步：npm run traders:map 生成用例映射。');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

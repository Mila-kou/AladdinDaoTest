import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';

import { z } from 'zod';

import { environmentNames, type EnvironmentName } from '../../config/environments/catalog.js';
import { maskUrl } from '../config/runtime.js';
import { readEnvironmentSettings } from './environment-settings.js';

const requestSchema = z.object({
  environment: z.enum(environmentNames),
  action: z.enum(['check', 'start', 'status', 'stop']),
});

export interface KeeperServiceResult {
  readonly environment: EnvironmentName;
  readonly action: 'check' | 'start' | 'status' | 'stop';
  readonly command: string;
  readonly rpcMasked: string;
  readonly chainId: number;
  readonly ok: boolean;
  readonly output: string;
}

function redact(value: string, rpcUrl: string): string {
  return value.replaceAll(rpcUrl, maskUrl(rpcUrl)).slice(-12_000);
}

export class KeeperServiceManager {
  private readonly runnerPath: string;

  constructor(private readonly projectRoot: string) {
    this.runnerPath = join(projectRoot, 'tools', 'keeper-runner', 'run.sh');
  }

  async execute(rawInput: unknown): Promise<KeeperServiceResult> {
    const input = requestSchema.parse(rawInput);
    const settings = await readEnvironmentSettings(this.projectRoot, input.environment);
    if (!settings.rpcUrl) throw new Error(`${input.environment} 尚未配置主 RPC，先在“测试环境”保存并初始化 Fork。`);
    if (!settings.chainId) throw new Error(`${input.environment} 尚未配置固定 Chain ID，先在“测试环境”填写。`);
    await access(this.runnerPath, constants.X_OK);

    const command = input.action === 'start' ? 'both' : input.action;
    const args = [this.runnerPath, command];
    const environment = {
      ...process.env,
      KEEPER_RUN_RPC_URL: settings.rpcUrl,
      KEEPER_EXPECTED_CHAIN_ID: String(settings.chainId),
    };
    const child = spawn('bash', args, {
      cwd: resolve(this.projectRoot, 'tools', 'keeper-runner'),
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = await new Promise<{ code: number; text: string }>((resolveResult, reject) => {
      let text = '';
      const append = (chunk: Buffer | string) => { text += String(chunk); };
      child.stdout.on('data', append);
      child.stderr.on('data', append);
      child.once('error', reject);
      child.once('exit', (code) => resolveResult({ code: code ?? 1, text }));
    });
    return {
      environment: input.environment,
      action: input.action,
      command: `KEEPER_RUN_RPC_URL=<当前 ${input.environment} RPC> KEEPER_EXPECTED_CHAIN_ID=${settings.chainId} ./run.sh ${command}`,
      rpcMasked: maskUrl(settings.rpcUrl),
      chainId: settings.chainId,
      ok: output.code === 0,
      output: redact(output.text, settings.rpcUrl),
    };
  }
}

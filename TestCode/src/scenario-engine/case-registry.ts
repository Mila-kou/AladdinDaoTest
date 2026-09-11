import type { ScenarioDefinition } from './actions.js';

export interface CaseRegistryEntry {
  readonly caseId: string;
  readonly title: string;
  readonly requirements: readonly string[];
  readonly scenario: ScenarioDefinition;
}

export class CaseRegistry {
  private readonly entries = new Map<string, CaseRegistryEntry>();

  register(entry: CaseRegistryEntry): this {
    if (entry.caseId !== entry.scenario.caseId) {
      throw new Error(`登记 caseId ${entry.caseId} 与场景 ${entry.scenario.caseId} 不一致`);
    }
    if (this.entries.has(entry.caseId)) throw new Error(`重复登记 Case ID：${entry.caseId}`);
    this.entries.set(entry.caseId, entry);
    return this;
  }

  get(caseId: string): CaseRegistryEntry {
    const entry = this.entries.get(caseId);
    if (!entry) throw new Error(`未登记 Case ID：${caseId}`);
    return entry;
  }

  list(): readonly CaseRegistryEntry[] {
    return [...this.entries.values()].sort((a, b) => a.caseId.localeCompare(b.caseId));
  }
}


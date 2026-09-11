import { decodeFunctionalAutomationEvidenceAttachment } from './src/reporting/write-outputs.js';
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('artifacts/latest/attachments/XT-MKT-OPEN-001-tx-fork-r0-0-xt-mkt-open-001-evidence.json','utf8'));
const result:any = { id:'XT-MKT-OPEN-001', project:'tx-fork', executedAt:'2026-09-04T09:21:47.851Z' };
const ev = decodeFunctionalAutomationEvidenceAttachment(raw, result, 'artifacts/latest/attachments/XT-MKT-OPEN-001-tx-fork-r0-0-xt-mkt-open-001-evidence.json', process.cwd());
console.log('hasEvidence', !!ev);
if (!ev) process.exit(0);
console.log('checks', ev.checks.length);
console.log('withFormula', ev.checks.filter((c)=>Boolean(c.formula)).length);
console.log(ev.checks.slice(0,5).map((c:any)=>({name:c.name, formula:c.formula, passed:c.passed, status:c.status})));
console.log('transactions', ev.transactions.length);

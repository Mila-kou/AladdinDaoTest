import { reconciliationReportSchema } from './src/reconciliation/schema/check-record.js';
import { readFileSync } from 'node:fs';
const raw = JSON.parse(readFileSync('artifacts/latest/attachments/XT-MKT-OPEN-001-tx-fork-r0-0-xt-mkt-open-001-evidence.json','utf8'));
const parsed = reconciliationReportSchema.safeParse(raw.reconciliationReport);
console.log('success', parsed.success);
if(!parsed.success){ console.log(parsed.error.issues.map(i=>({path:i.path,message:i.message})).slice(0,20)); }
else console.log('checks', parsed.data.checks.length, parsed.data.checks.filter((c)=>c.formula).length);

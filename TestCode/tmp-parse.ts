import { canonicalEvidenceEnvelopeSchema } from './src/evidence/adapters/v2-to-v3.js';
import { readFileSync } from 'node:fs';
const raw = JSON.parse(readFileSync('artifacts/latest/attachments/XT-MKT-OPEN-001-tx-fork-r0-0-xt-mkt-open-001-evidence.json','utf8'));
const parsed = canonicalEvidenceEnvelopeSchema.safeParse(raw.evidenceV2);
console.log('success', parsed.success);
if(!parsed.success){ console.log(parsed.error.issues.map(i=>({path:i.path,message:i.message})).slice(0,20)); }
else console.log('actions', parsed.data.actions.length, parsed.data.actions[0].actionId, parsed.data.actions[0].transactions.length);

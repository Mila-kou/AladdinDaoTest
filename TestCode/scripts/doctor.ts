import { runDoctor } from '../src/doctor/run-doctor.js';

process.exitCode = await runDoctor();

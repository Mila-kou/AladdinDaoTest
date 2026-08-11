export const metricDefinitions = {
  plannedScenarios: 'SCENARIO-CHECKLIST 中的唯一 SCN 数量。',
  manualScenarios: '标记为手工核对的唯一 SCN 数量：设计上依赖真人操作（浏览器钱包切账户、换设备、拒签），不产出自动化代码；仍必须人工执行并回填证据，不等于已通过。',
  automatableScenarios: '规划场景数 − 手工核对场景数，即应当由自动化覆盖的场景数。',
  automatedScenarios: '本次 Playwright 发现并映射到场景目录的唯一 SCN 数量；手工核对场景不计入。',
  automationCoverage: '自动化场景数 / 应自动化场景数（规划 − 手工核对）；按唯一 SCN 计算，不按浏览器或 Project 重复计数。',
  executedResults: '状态为 PASS、FLAKY 或 FAIL 的场景-Project 最终结果数。',
  finalSuccessRate: '(PASS + FLAKY) / (PASS + FLAKY + FAIL)。BLOCKED 和 SKIP 不进入分母。',
  stablePassRate: 'PASS / (PASS + FLAKY + FAIL)，用于识别依赖重试才能成功的场景。',
  flaky: '至少一次失败或超时，最终重试通过的场景-Project 结果。',
  blocked: '使用 blocked 注解明确标记因环境、依赖或外部条件无法执行的结果。',
  duration: '筛选范围内所有测试尝试耗时之和，不等于并行运行时的墙钟时间。',
} as const;

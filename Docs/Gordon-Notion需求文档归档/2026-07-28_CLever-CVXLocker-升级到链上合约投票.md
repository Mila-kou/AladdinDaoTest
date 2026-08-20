---
title: CLever CVXLocker 升级到链上合约投票
notion_url: https://app.notion.com/p/3aa3d7873f2c80338e4fd138ef230597
author: Gordon (chao@aladdin.club)
last_edited: 2026-07-28
archived: 2026-07-28
---

## 🧪 测试状态（2026-07-26 更新）
fork 侧测试已完成：两轮 Tenderly Mainnet Fork 实测，**33/33 用例全 PASS**，技术结论 **CONDITIONAL GO**。完整总结（测试环境 / 用例明细 / 关键发现 / 遗留事项）见：
[CLever vlCVX 链上投票升级 — 测试总结（2026-07-26）](https://app.notion.com/p/3ab3d7873f2c81328e6ee73fa1498d4e)
~~🔴 两个需要团队关注的新发现：（与高总确认过，暂时不需要关注）~~
1. **~~Gauge Vote Platform 不查 ~~****~~`isValidGauge`~~**~~——对已注册但 killed 的 gauge 投票不 revert、权重白扔，voter 脚本必须逐 gauge 自查 ~~~~`isRegisteredGauge`~~~~ + ~~~~`isValidGauge`~~~~；~~
2. **~~主网 ~~****~~`rewardTokens`~~****~~ 当前为空 → ~~****~~`harvest()`~~****~~ 必然 revert**（实际有 173k cvxCRV + 9.5k FXS 可领）。属既有配置非升级回归，请确认是否有意、存量奖励如何处理。~~

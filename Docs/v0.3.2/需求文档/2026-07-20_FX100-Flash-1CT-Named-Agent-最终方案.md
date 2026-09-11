# FX100 Flash 1CT · 命名会话密钥(Named Agent)最终方案

> Notion 原文：[FX100 Flash 1CT · 命名会话密钥(Named Agent)最终方案](https://app.notion.com/p/FX100-Flash-1CT-Named-Agent-3a33d7873f2c8117b564f6c93f42a446)  
> 本地归档：2026-09-06  
> 版本归属：v0.3.2
> Notion 创建时间：2026-07-20 20:19（Asia/Shanghai）

> **一句话**:把 1CT 的会话密钥做成 **HL 式"命名随机 agent"**——每台设备一把**随机 key**、挂在一个**人类可读的命名槽**(如 "Chrome · macOS")下,**同名覆盖**、**槽位数量有上限**。这样同时拿到:多设备、可管理(撤销时面对"iPhone"而非 `0x4a03…`)、零孤儿、可轮换、抗钓鱼。 **面向**:前端工程师 + 合约工程师。**背景/推导**见 `flash-mode-security-review.md`(§6、第四部分);本文是可落地的最终方案。 **状态**:随机 key + 90 天 + Stay connected 等前端改造已在分支 `feat/flash-1ct-hl-style` 实现(= 本方案的"单槽/unnamed"子集);本方案在其上增量到"命名多槽"。

---

## 1. 为什么选命名随机 agent(方案对比)

**结论**:①最简但不支持多设备;②多设备但管理 UX 无解;③确定性泄露不可救、可被钓鱼复算(见评审第四部分 §4.7);**④在多设备 / 可管理 / 安全三者上同时达标,是 HL 的做法**。

> ④ 是 ① 的超集:普通用户默认只用**一个槽**(每台设备自动命名),体验等同于①的单设备简单流;需要多设备的人自然获得多槽。**不给普通用户增加任何理解负担。**

---

## 2. 用户体验(产品视角)

### 2.1 设备自动命名,普通用户无感

- 首次在某设备开启 Flash 时,前端**自动生成设备名**(如 `Chrome · macOS`、`Safari · iOS`),用户**不用输入**。可在高级里改名。

- 该设备的 key = **一把随机 key**,挂在这个命名槽下。

- **同设备重开/重设** = 同名 → **覆盖**旧的(旧 key 自动失效,零孤儿)。

### 2.2 多设备:各设备各一把,并存

- 桌面:槽 `Chrome · macOS` = keyA;手机:槽 `Safari · iOS` = keyB。**两把并存,各自独立交易**。

- 每设备只在**本机**持有自己那把 key;其他设备的 key 不在本机(这正是隔离点)。

### 2.3 管理 UI(关键:按设备名,不是地址)

设置页展示 **"我的交易设备"**列表,数据来自链上(`Reader.getSubaccounts`),每行:

```
Chrome · macOS    Active · 剩 89d      [撤销]   ← 当前设备
Safari · iOS      Active · 剩 62d      [撤销]
────────────────────────────────────────
[ 在所有设备上退出 ]  (Sign out everywhere)
```

- 用户看到的是**设备名**,做的是"撤销 iPhone / 全部退出"这种**能懂的决策**,而不是"这个 `0x4a03…` 是不是我的"。

- **在所有设备上退出** = `revokeAll`(登录心智,大家都懂)。

### 2.4 跨设备场景走查

---

## 3. 合约改动(给合约工程师)

> 现状(已核对源码):`subaccountListKey(account)` 是**地址 set**、无排他、无 revokeAll;`removeSubaccount` 只删 set 不清 field;`SubaccountApproval` **无 name 字段**。本方案把它升级为**命名槽**模型。

### 3.1 数据模型:命名槽

- `SubaccountApproval` **新增字段 `name`**(建议 `bytes32`,可放 ≤31 字节的设备名 UTF-8;或 `string`,由工程师定)。

- 新增 `mapping(address account => mapping(bytes32 name => address)) activeSubaccountByName` —— 每个命名槽当前的地址。

- 维护每个 account 的**命名槽集合**(小集合,受上限约束),供枚举。

- **上限 `MAX_NAMED_SUBACCOUNTS`**(建议默认 5,可配)。

### 3.2 授权(handleSubaccountApproval)语义变更

授权带 `name` 时:

1. 若 `activeSubaccountByName[account][name]` 已有旧地址 → **先把旧地址从授权 set 移除 + 清其 field**(overwrite,零孤儿);

1. 把新地址写入 set、写入 `activeSubaccountByName[account][name]`、set 命名槽;

1. 若是**新名字**且命名槽数已达 `MAX_NAMED_SUBACCOUNTS` → **revert**(引导用户先撤一台)。

> 这样"同设备重设=覆盖、异设备=新增槽、超限=拒绝",天然无孤儿、有上限。

### 3.3 撤销

- `removeSubaccount(name)` 或 `removeSubaccountByAddress(addr)`:清对应槽(**同时清 field**,修复现有"remove 不清 field"隐性 bug)。

- **`revokeAll(account)`**:清空该 account 全部命名槽。因上限小(~5),**直接遍历清即可**;若想 O(1),用 **per-account epoch 计数器**(`validateSubaccount` 要求注册 epoch==当前;revokeAll=epoch+1)。

### 3.4 校验(validateSubaccount)

- 维持"查授权 set 成员 + 过期/次数另查"不变;因 overwrite 保证 set 内只有各槽的**当前**地址,set 恒小、无孤儿。

- (若用 epoch)追加"注册 epoch == 当前 epoch"检查。

### 3.5 Reader:枚举命名槽

- 新增 `getSubaccounts(account)` 返回数组:`{ name, address, expiresAt, maxAllowedCount, actionCount, isExpired }`。

- 因有上限(~5),**无需分页**;`name` 必须能读回(bytes32 直接返回 / 或从事件),供前端展示设备名。

### 3.6 事件

- Add/Remove/RevokeAll 事件带 `name`,方便前端/索引器展示与审计。

---

## 4. 前端改动(给前端工程师)

> 在 `feat/flash-1ct-hl-style`(随机 key 已完成)基础上**增量**。

1. **设备名生成**:`packages/sdk`/hook 里加 `deviceName()`,从 `navigator.userAgentData`/UA 解析成 `Chrome · macOS`;允许用户改名并本地记住。

1. **签名带 name**:`useSubaccountSession.signApproval()` 与 `signSubaccountApproval`(EIP-712 类型)**新增 `name` 字段**(与合约 struct 对齐);setup 用本设备名。

1. **本地存储按 (chainId, owner, name)**:本机只存**自己这台**的 key(其他设备的 key 不在本机)。

1. **管理 UI**:新建"我的交易设备"面板,调 `Reader.getSubaccounts(account)` 渲染设备列表(名字+状态+剩余有效期),每行"撤销"→`removeSubaccount(name)`;底部"在所有设备上退出"→`revokeAll`。

1. **setup 流程**:用本设备名授权 → 同设备重设=覆盖(无孤儿);超限时前端提示先撤一台。

1. **撤销可撤任意设备**:removeSubaccount 由主钱包签名、只需 name/地址,故可在任一设备撤销其他设备的槽。

1. **文案**(延续第三部分大白话):设备名、"在所有设备上退出"、"最多 N 台设备"等;继续避免 session/subaccount/1CT 黑话。

> 已完成且**继续沿用**:随机 key、90 天有效期、100 万额度、Stay connected(存储无签名读回)、去 1h 闲置锁。命名多槽是在此之上加"槽"维度。

---

## 5. 安全性

### 5.1 威胁模型与应对

### 5.2 残留风险(与 HL 同级,已知并接受)

- **at-rest 弱加密**:key 以 AES(公开地址口令)存本机(≈混淆非真加密),与 HL(明文)同级;安全靠"只能交易+可撤销+会过期+每设备隔离",不靠磁盘加密。对用户文案**不夸大 "encrypted"**。

- **90 天有效期**:因命名槽无孤儿、且可随时撤销,90 天安全;仍建议保留"在所有设备退出"作为一键止血。

### 5.3 为什么比其他方案安全

- vs **确定性 key**:随机 key 泄露可自救、不可被钓鱼复算(确定性两者皆失,且所有设备同一把、一泄全泄)。

- vs **无限随机 set**:命名 + 上限 + 覆盖 → 无孤儿、可管理。

- vs **单把排他**:多设备下不会"手机一登就把桌面踢了"(各设备独立槽)。

---

## 6. 上线顺序与开放问题

### 6.1 顺序依赖

1. **合约先上"命名槽授权 + removeSubaccount(name) + revokeAll + Reader.getSubaccounts"**,并在 remove 时清 field;

1. 前端再接:签名带 name、管理 UI、超限提示;

1. 在合约命名槽就绪前,前端维持 `feat/flash-1ct-hl-style` 的**单随机 key**(等价于"一个默认槽"),并可用 interim(历史地址列表 + rotate 先撤)兜底孤儿。

> ⚠️ **90 天有效期**在"命名槽覆盖(或 revokeAll)"上线后才完全安全;在此之前若已上 90 天,用 interim 兜底或临时调短。

### 6.2 待拍板

- **槽位上限 N**:建议 5(HL ~4);

- **命名策略**:自动设备名(推荐)/ 允许用户自定义 / bytes32 vs string;

- **revokeAll 是否含当前设备**:建议"在所有设备退出"=含当前(panic 语义),另有逐设备撤销做选择性;

- **是否要 epoch**:上限小可直接遍历;若担心极端情况用 epoch 做 O(1);

- **是否保留"临时槽 vs 固定槽"区分**(给自带私钥的高级子账号做自动清理,见评审 §4.4③)——可作为后续增强,非首版必需。

---

## 附:关联

- 推导与全部对比:`flash-mode-security-review.md`(§6、第四部分)

- HL 前端实测:`hyperliquid-agent-wallet-lifecycle.zh.md`

- 前端已完成的随机 key 改造:分支 `feat/flash-1ct-hl-style`

# 🔐 子账户槽位数量上限（MAX_SUBACCOUNT_SLOTS）设计讨论

> Notion 页面：[原文](https://app.notion.com/p/3be3d7873f2c81888772e299be3286b6)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-16
> 最后编辑：2026-08-16
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

> 👥 受众：合约工程师　｜　来源：docs/analysis/../superpowers/specs/2026-08-17-subaccount-slot-limit-design.md

# 子账户槽位数量上限（`MAX_SUBACCOUNT_SLOTS`）设计讨论

**日期**: 2026-08-17

**状态**: 讨论完成，给出建议方向，尚未实施（合约无改动）

**受众**: 合约工程师、产品/安全

**涉及模块**: `src/subaccount/SubaccountUtils.sol`、`src/reader/Reader.sol`（引用同一常量）、`src/config/Config.sol`（如采纳"变量化"方案）

**关联文档**: [docs/analysis/TEST_REVIEW_FINDINGS.md 问题 9](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/TEST_REVIEW_FINDINGS.md)、`docs/bugs/BUGS.md` R6 章节（第 835-873 行，Named Agent 槽位设计的既有行为记录）

---

## 一、背景与问题

v0.3.2 合约给子账户（session key）功能新增了"命名槽位"模型：每个主账户最多可以同时挂载若干个具名子账户（比如 `chrome-macos`、`safari-iphone`，对应不同设备/浏览器各自的 session key）。产品側提出：为了安全——避免用户在某台设备上授权过子账户之后，换到别的设备继续用，却忘记旧设备的授权还处于生效状态，形成一个用户自己都不知道存在的攻击面——上线时想只允许 1 个槽位同时生效，用"少一点多设备便利性"换"更简单、更不容易被忽略"的安全模型。

围绕这个目标，讨论了三种技术路径，本文档记录对比结论。

---

## 二、现状（链上代码事实）

- `MAX_SUBACCOUNT_SLOTS` 定义在 `src/subaccount/SubaccountUtils.sol:33`：
  ```solidity
  uint256 public constant MAX_SUBACCOUNT_SLOTS = 4;
  ```
  是 Solidity **编译期常量**，当前值是 **4**（不是产品讨论里提到的 5——`git log -p` 全部历史里这个值从引入起就是 4，仓库里也没有任何地方出现过"5"这个数字，需要核对一下最初"5"这个说法的来源文档）。同一个值在 `src/reader/Reader.sol:27` 又声明了一次（`= SubaccountUtils.MAX_SUBACCOUNT_SLOTS`），编译期内联进多份字节码。
- 存储模型：按 `(account, index)` 维护三个 key（`subaccountSlotKey`/`subaccountSlotSubaccountKey`/`subaccountSlotActiveKey`，`FX100Keys.sol:969-979`），`index` 取值范围 `[0, MAX_SUBACCOUNT_SLOTS)`。
- 用到这个常量做循环上界的函数：`addSubaccount`（`:58-113`，含"找同名槽位复用"、"找空闲槽位"、"查重复地址"三处循环）、`removeSubaccount`（`:115-147`）、`removeSlot`（`:149-185`）、`validateSubaccount`（`:329-342`）。
- `Config.sol` 的两级白名单（`allowedBaseKeys`/`allowedLimitedBaseKeys`）里**没有任何一个 key 对应槽位数量**——只有 `SUBACCOUNT_FEATURE_DISABLED`（整体开关）、`SUBACCOUNT_INTEGRATION_DISABLED`、`MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT`（跟数量无关）三个子账户相关 key。
- GMX 原版（`gmx-synthetics`）子账户是无上限地址 Set（`dataStore.addAddress`/`removeAddress`），**没有数量上限这个概念**——"槽位上限"是 FX100 fork 之后自研新增的，GMX 没有可参考的先例。
- 前端（`fx100-apps`）现状：完全没有实现 v0.3.2 这套槽位模型（还在对接 v0.3.1 的无上限旧模型，`SubaccountApproval` 结构体连 `slot` 字段都没有，仓库里也没有 v0.3.2 的部署快照）。**这意味着无论最终选哪个方案，前端都是从零开始做，"1个槽位"不比"4个槽位"更省前端工作量，甚至可能更简单**（单一"这台设备"开关 vs 完整的多槽位列表管理）。

一个已知的行为细节（`docs/bugs/BUGS.md` 第 835-873 行，R6-B01，工程师已确认 by design）：`removeSubaccount`（按地址撤销）**不释放槽位**，只有 `removeSlot`（按名字）才真正腾出容量。这个细节在下面三个方案里都要考虑。

另外，无论槽位数量多少，`handleSubaccountAction` 每次交易执行都会校验 `expiresAt`/`maxAllowedCount`（`:307-327`），过期或次数用尽的子账户即使还占着槽位也无法再交易——这是独立于槽位数量之外、已经存在的另一层"遗忘设备失效"兜底。

---

## 三、三个方案对比

### 方案 A：重新部署，把常量直接改成 1

**做法**：`MAX_SUBACCOUNT_SLOTS = 1`，重新编译部署 `SubaccountUtils`/`SubaccountRouter`/`SubaccountRelayRouter`/`Reader`。

**优点**：

- 协议层面的硬保证——不管哪个客户端、传什么 slot 名字，第二个槽位在链上**不可能**存在，不依赖任何一方"遵守约定"。
- 现在做成本最低：v0.3.2 的 4 槽位模型从未部署过（无论测试网还是主网都没有实际快照），不存在"从已上线的 4 个槽位降级"的迁移成本，也不存在"以后不小心改回 4，之前的旧槽位数据复活"的风险（因为从来没有 index>0 被写过）。

**代价/待办**：

- `removeSubaccount` 不释放槽位这个既有行为，在 `MAX=1` 下会被放大：用户撤销旧设备后，想换绑一个新命名的设备，如果没有显式调 `removeSlot`，会直接命中 `MaxSubaccountSlotsExceeded`。这个"1 槽位换设备"的具体交互现有测试完全没覆盖（现有测试都是围绕 4 槽位写的），需要补测试，前端的"更换设备"操作也需要设计成"撤销 + `removeSlot`"两步或合并成一步，不能只调 `removeSubaccount`。
- 以后如果想放开到多设备，需要再走一次合约升级（同样的重新部署流程）。

### 方案 B：常量保持 4，前端约定每次都用同一个固定 slot 名覆盖

**做法**：合约不改，前端每次创建子账户时，`slot` 参数永远传同一个固定字符串（比如 `"primary"`，而不是按设备生成的 `chrome-macos` 这类名字）。`addSubaccount` 命中"同名且 active"分支时会直接覆盖旧地址（`:96-98`），`validateSubaccount` 扫描不到旧地址会立即失效——已验证这确实等价于把旧设备完全撤销。

**优点**：

- 不需要合约改动/部署。
- 保留了以后想放开到多设备的灵活性——只需要改前端逻辑（不再覆盖、改成按设备命名的新增），不需要重新部署合约。

**代价**：

- **安全边界从"合约强制"变成"前端一直遵守约定"**——这条规则完全不在链上，任何未来的客户端（改版的官方前端、第三方集成、用户直接用工具构造签名）只要传了不同的 slot 名字，就会在用户毫无察觉的情况下多出一个槽位，恰好是最初想避免的场景。命名槽位这个功能本来的设计初衷就是"按设备生成可识别的名字"（`chrome-macos`/`safari-iphone` 这类），"永远用同一个名字"是对这个功能的反向使用，需要长期、跨版本地维持这条约定才能保证安全目标不被破坏。

### 方案 C（本轮讨论）：把常量改成变量，本文档的结论

**做法**：`MAX_SUBACCOUNT_SLOTS` 从 Solidity `constant` 改成从 `DataStore` 读取的可配置值，接入 `Config.sol` 的白名单体系（跟前面讨论 depth/`RESERVE_FACTOR` 那批参数走同一套改法），`addSubaccount`/`removeSubaccount`/`removeSlot`/`validateSubaccount` 里的循环上界改成读这个动态值。

**这个方向技术上直接可行，但发现一个跟其他"市场风险驱动"参数不同、需要特别处理的问题**：这个值是一个作用在**每个账户已有存储数据**上的循环上界，往两个方向调整的风险不对称：

- **调大是安全的**：只要之前从没到过更高的值，高位 index 从没被写过，调大不会凭空冒出数据。
- **调小是危险的，而且是实时生效、影响全体账户**：
  1. 假设某账户在 index 1-3 已经有激活的子账户，一旦把这个全局值调小到 1，`validateSubaccount` 的循环上界立刻收紧，这些子账户**瞬间校验失败**——不是被正式撤销，存储里的数据完全没变，只是扫不到了，用户没有收到任何通知，这是一个真实的功能性 breaking change，且在参数变化的那一刻**同时影响所有账户**（这个值是全局单一值，不是按账户存的）。
  2. 更严重的是：如果以后又把这个值调回大，index 1-3 那些"没被清掉、只是暂时扫不到"的旧数据会**自动复活**——这正是最初想避免的"用户遗忘的旧设备突然又生效"风险本身，而且现在触发它只需要一次治理/`CONFIG_KEEPER` 操作，比方案 A"需要重新部署合约"的门槛低得多，也就更容易被误操作触发。
  3. 没有类似 PnL 阶梯参数那种"链下脚本先做不变式校验再提交"（`setGlobalPnlLadder.ts`）的对应方案能让"调小"这个方向变安全——真正安全的"调小"需要先遍历所有账户、清理掉超出新上限的槽位数据，这在链上不现实，也超出了"改一个参数"这件事本身的范畴。

**结论**：这个参数**不适合**被归进"市场风险驱动、可以放心交给 `LIMITED_CONFIG_KEEPER` 或任何自动化流程定期调整"的那一类（参见 [config-keeper-sync-mechanism-design.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/superpowers/specs/2026-08-13-config-keeper-sync-mechanism-design.md) 里建立的判断框架——它不是"链下监控算出新值"的输出，而是一个直接影响账户权限数据一致性的结构性参数）。

**建议做法**：把它改成变量（解决"硬编码在多个 `.sol` 文件里、不同环境/部署想用不同值就得改代码"的工程痛点），但**不要**接入 `Config.sol`/`ConfigSyncer` 那套面向"日常调整"设计的治理体系——当成"部署/初始化阶段设一次，之后当不变量对待"的值，不开放给日常调用修改。如果未来确实需要调大（比如先上线 1，验证一段时间后放开到多设备），这个方向本身是安全的，可以留一个受限的"只能调大"入口；如果未来需要调小，应该作为一个独立的、需要设计"账户级数据清理迁移"的工程任务来做，不应该跟"改一个数字"这件事混为一谈。

---

## 四、给决策者的三选一小结

|  | 安全强度 | 现在的实施成本 | 未来"放开到多设备"的成本 | 未来"进一步收紧"的风险 |
|---|---|---|---|---|
| **A：常量改 1，重新部署** | 最强（协议层硬保证） | 低（v0.3.2 还没部署过，无迁移成本） | 需要再部署一次 | 不适用（已经是 1） |
| **B：常量留 4，前端约定同名覆盖** | 弱（依赖前端/未来所有客户端一直遵守约定，链上不强制） | 最低（零合约改动） | 最低（只改前端） | 不适用（约定层面，无链上状态残留问题） |
| **C：改成变量，仅部署时设置** | 强（等同方案 A，只是不用硬编码字面量） | 低（一次性改造，需搭配测试） | 低（"调大"方向可以做成安全的受限入口） | 高（如果错误地把它做成日常可调，"调小"方向有真实的账户数据一致性风险，本文档建议明确排除这种用法） |

本文档倾向方案 A 或方案 C（两者安全强度等价，C 换来部署灵活性，代价是需要工程上明确约束"这个变量只能在受控场景调大、不做日常治理"这条纪律，否则退化成一个隐患）；方案 B 技术上可行但安全目标打了折扣，仅在"未来大概率会放开多设备、且能接受这个安全折扣"时才是更优选择——最终选哪个是产品/安全侧的取舍判断，本文档不代为决定。

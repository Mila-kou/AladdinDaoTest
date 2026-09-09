---
title: flash-mode-security-review
notion_url: https://app.notion.com/p/3913d7873f2c801daa4de9d85c38f27a
author: Gordon (chao@aladdin.club)
last_edited: 2026-07-26
archived: 2026-07-28
---

# Flash(Express)模式:产品说明 + 安全评审
> 本文分两部分: - **第一部分 · 产品与功能总览**:面向所有人(含非技术),讲清楚 Flash 是什么、解决什么问题、现在实现了哪些功能、"1 小时自动锁定"是怎么回事。 - **第二部分 · 安全评审**:面向开发者,评估 session key 的生成/存储/授权/轮换机制的风险与改进建议。
---
# 第一部分 · Flash(Express)产品与功能总览
## 1. 一句话说清楚 Flash 是什么
**Flash(产品名)= Express(行业术语)= 快速下单模式。** 它要解决的是链上交易最烦人的一件事:**每下一单、改一单、撤一单,钱包都要弹窗让你签名确认**。开了 Flash 之后,这些弹窗消失,下单像中心化交易所一样"点一下就成交"。
> 类比:普通模式 = 每次刷卡都要输密码;Flash 模式 = 提前授权后"闪付",小额免密。
## 2. Flash 底下有两种技术实现
产品层统一叫 "Flash",合约层其实是两条路径:
<table header-row="true" header-column="false">
<tr>
<td>产品叫法</td>
<td>合约术语</td>
<td>谁付 gas 费</td>
<td>谁广播交易</td>
<td>通俗理解</td>
</tr>
<tr>
<td>**Flash One-Click(1CT)** ✅ 当前唯一对外展示</td>
<td>subaccount</td>
<td>用户(用 USDC 抵扣)</td>
<td>Keeper(代付 gas)/ 或 subaccount</td>
<td>一次授权,之后下单免弹窗</td>
</tr>
<tr>
<td>**Gasless 模式** ⏸ 代码保留、UI 隐藏</td>
<td>relay</td>
<td>用户(用 USDC 抵扣,连 gas 都不用有 ETH)</td>
<td>Keeper 代广播</td>
<td>连 ETH 都不用持有</td>
</tr>
</table>
**现在用户实际看到、用到的是 "Flash One-Click(1CT)"。** 下面重点讲它。
## 3. One-Click 是怎么做到"免弹窗"的
核心是一个叫 **session key(会话密钥 / subaccount 子账户)** 的东西:
```plain text
第一步(一次性,需要弹窗):
  用户用主钱包签一次名 → 生成一把"专用小钥匙"(session key)
  用户再签一次授权 → 告诉合约:"这把小钥匙可以替我下单,有效期/次数有限"

第二步(之后所有下单,无弹窗):
  下单时用"小钥匙"自动签名 → 交给 Keeper 广播 → 成交
  主钱包全程不再弹窗
```
这把"小钥匙"是**受限的**:
- 只能**下单/改单/撤单**,**不能转走你的钱**;
- 有**过期时间**(默认 24 小时)和**次数上限**,到期或用完自动失效;
- 存在你自己浏览器里,不上传服务器。
## 4. 现在已经实现了哪些功能(产品清单)
面向用户能感知的能力:
- ✅ **一键开仓 / 平仓**:开启 Flash 后,市价单、限价单、触发单下单全程免弹窗。
- ✅ **改单 / 撤单免弹窗**:修改止盈止损、取消挂单都不弹窗。
- ✅ **一键全撤(Cancel All)**:多个挂单一次性原子撤销(一次签名、一份手续费、要么全撤要么全不撤)。
- ✅ **手续费用 USDC 抵扣**:Flash 的执行成本从 USDC 余额里扣,有上限保护(签名时设 `maxFeeAmount`,超了直接失败,不会乱扣)。
- ✅ **订单状态实时追踪**:下单后有进度弹窗(OrderTrackingModal)显示 Keeper 处理进度。
- ✅ **设置页开关**:用户可在 Settings 里自主开启/关闭 Flash,并可随时清除 session。
- ✅ **1 小时自动锁定(安全兜底,见下)**。
技术侧已完成(给内部参考):完整签名 SDK、Oracle 参数自动获取、USDC permit 自动签、手续费动态估算、`isSizeDeltaUsd` 精度处理、订单解析修复等(详见第二部分下方的技术索引与"当前实现状态")。
## 5. 纯前端安全策略:1 小时自动锁定
这是一个**完全在浏览器前端**做的保护(不涉及合约),防止"人离开了电脑,别人趁机用你已授权的 session 下单"。
**规则:**
- 页面被**隐藏**(切到别的标签页、最小化、电脑锁屏)**累计满 1 小时**后,你再回到页面 → Flash 会话被**锁定**。
- 锁定后,session key 被暂时禁用(`getSigner()` 返回空),**任何 Flash 下单都会被挡住**,直到你重新签一次授权解锁。
- 短暂切窗、几分钟离开**不会**触发锁定,不影响正常使用。
- 解锁很简单:重新签一次 approval 即可继续。
**实现要点(给开发者):**
- 状态 `sessionLockedAtom`:**只存在内存、绝不落盘**,刷新页面即重置。
- `useSessionLockGuard` 监听 `document.visibilitychange`:页面隐藏时把时间戳写入 `sessionStorage`(用 sessionStorage 是为了扛住后台标签页的定时器节流/漂移),回到前台时比较时长。
- 阈值 `LOCK_THRESHOLD_MS = 60 * 60 * 1000`(1 小时)。
- 重新 `signApproval()` 成功后自动清除锁定(`setSessionLocked(false)`)。
> ⚠️ **注意这层是"离开锁"不是"闲置锁"**:它检测的是"页面隐藏时长",不是"页面可见但无操作"。这是刻意的取舍——既拦住"离开电脑"的场景,又不打扰正在盯盘但暂时没下单的用户。它和合约层的 24 小时 `expiresAt`、次数上限是**互补的多层防护**。
---
## 6. 会话生命周期:用户什么时候需要"重新签"?(重点)
> 这是本轮最重要的产品问题。核心矛盾:**签太频繁用户会烦,签太松安全性差**。下面讲清 FX100 现在的策略、和 Hyperliquid 的差距、以及取舍。
### 6.1 首次进来:默认就是 Flash 1CT,需要 setup
现在**新用户第一次进来,默认模式就是 Flash One-Click(1CT)**(设置项 `flashModeAtom` 默认值 = `'1ct'`)。所以下单按钮会先变成引导:
```plain text
下单按钮 → "⚡ Set up Flash One-Click Trading"(需要先设置)
```
**setup 需要主钱包签两次**(一次性):
1. **Generate session key**(签一条固定消息 `Generate a fx100 1CT ...`,派生 session key);
2. **Sign approval**(签 EIP-712 `SubaccountApproval`:`shouldAdd=true`、`expiresAt`=24h 后、`maxAllowedCount=90`、`nonce=0`)。
> UI 状态从 `Inactive`(Not generated)→ 签完第 1 步变 `Needs approval` → 签完第 2 步变 `Approved`。 **注意还有第三次签名**:UI 明确提示 `Your first trade will require a one-time USDC approval signature.` —— **首笔交易需要额外签一次一次性的 USDC permit 授权**(之后不再需要)。所以完整体验是"setup 2 签 + 首单 1 签",此后才是全程免弹窗,直到触发下面某个"需要重签"的条件。
### 6.2 什么情况会要求重新签?(完整触发表)
系统用一个状态机(`useFlashSessionStatus`)判断当前会话状态,下单按钮(`useFlashOrderGate`)据此自动切成 `setup` / `renew` / 正常下单。**7 种状态**:
<table header-row="true" header-column="false">
<tr>
<td>状态</td>
<td>含义</td>
<td>用户看到</td>
<td>要重签吗</td>
</tr>
<tr>
<td>`needs-session`</td>
<td>从没设置过 / 存储被清</td>
<td>"Set up 1CT"</td>
<td>✅ 签 2 次(全套 setup)</td>
</tr>
<tr>
<td>`needs-approval`</td>
<td>有 key 但没授权</td>
<td>"Set up 1CT"</td>
<td>✅ 签 1 次(授权)</td>
</tr>
<tr>
<td>`active`</td>
<td>正常可用</td>
<td>正常下单</td>
<td>❌</td>
</tr>
<tr>
<td>`expiring-soon`</td>
<td>距过期 \<4 小时</td>
<td>黄字提醒</td>
<td>❌(仍可下单,提示续期)</td>
</tr>
<tr>
<td>`expired`</td>
<td>授权超过 24h 过期</td>
<td>"Renew"</td>
<td>✅ 重签授权</td>
</tr>
<tr>
<td>`limit-reached`</td>
<td>90 单额度用完</td>
<td>"Renew"</td>
<td>✅ 重签授权(再给 90 单)</td>
</tr>
<tr>
<td>`locked`</td>
<td>页面隐藏 ≥1h(离开锁)</td>
<td>"Renew"</td>
<td>✅ 重签授权(顺带解锁)</td>
</tr>
</table>
外加一个软提醒:剩余单数 ≤10 时标 `isLowOrders`(黄色),提示快用完。
**归纳成人话——满足以下任一条,就要重签:**
1. **过了 24 小时**(授权到期);
2. **下满 90 单**(次数额度用完);
3. **离开电脑超过 1 小时**(页面隐藏满 1h 的离开锁);
4. **清了浏览器存储 / 换了浏览器或设备 / 没开 Remember session 时关了标签页**(见 6.3)。
### 6.3 "Remember session":关浏览器要不要重签?(本轮新增)
这正是截图里 Flash settings 底部的 **"Remember session" 开关**(文案:`Keep your 1CT session key after closing this tab. The key is encrypted and stored only on this device.`),决定 key 和授权存哪:
<table header-row="true" header-column="false">
<tr>
<td>开关</td>
<td>存储位置</td>
<td>关标签页后</td>
<td>关浏览器/重启后</td>
</tr>
<tr>
<td>**关**(默认)</td>
<td>`sessionStorage`</td>
<td>**清空 → 要重设**</td>
<td>要重设</td>
</tr>
<tr>
<td>**开 Remember session**</td>
<td>`localStorage`</td>
<td>保留</td>
<td>**保留 → 不用重签**(直到 24h/90 单/1h 锁触发)</td>
</tr>
</table>
> ⚠️ 文案里的 "The key is encrypted" 要留意:这层"加密"是用**公开的钱包地址**当口令(见第二部分风险 3),实质是混淆而非真加密——对用户宣称"encrypted"时措辞要谨慎,别给出超出实际的安全感。
- 默认**不勾 = 安全优先**:关掉标签页,key 就没了,别人拿到你电脑也无从复用。
- 勾了 = 方便优先:重启浏览器也不用重设,代价是 key 长期躺在 localStorage(参见第二部分风险 3)。
- 另有**自动清理**:session 配置软 TTL 7 天、授权过期后再宽限 24h 即从存储剔除;并且后台会对比链上 nonce/过期/次数,一旦发现本地授权已失效就自动清掉(`FlashSessionStatusSync`)。
### 6.4 和 Hyperliquid 的浏览器级重签策略对照(实测 + 官方文档核实)
**HL 是两层结构**(理解这个才看得懂它的重签):
- **重层 · ApproveAgent**:主钱包签一条 EIP-712(见 §6.6),在链上注册一个**随机 agent 地址**,有效期**默认约 30 天、最长 180 天**。agent 私钥存浏览器。
- **轻层 · connection / "Establish Connection"**:tooltip 原文 \*"Cache connection signature so that you do not have to sign and establish a connection every time you visit the site."\* —— 是否**缓存连接凭证**免得每次访问重签。设置里的 **"Persist Trading Connection"** 和建立连接弹窗里的 **"Stay Connected"** 控制的就是这个(≈ FX100 的 "Remember session")。
> ⚠️ 未完全证实:"connection signature" 是否为**独立于** ApproveAgent 的第二条签名,还是就指 agent 凭证本身(HL 前端闭源)。但功能上"Persist/Stay Connected 决定凭证是否跨浏览器重启存活"是确定的。
**逐条对照 FX100 与 HL 的"什么时候要重签":**
<table header-row="true" header-column="false">
<tr>
<td>触发条件</td>
<td>FX100(现在)</td>
<td>**Hyperliquid**</td>
<td>依据</td>
</tr>
<tr>
<td>授权到期</td>
<td>**24 小时**</td>
<td>**默认约 30 天,最长 180 天**</td>
<td>✅ 官方文档</td>
</tr>
<tr>
<td>下单次数上限</td>
<td>**90 单后重签**</td>
<td>**无次数限制**</td>
<td>✅</td>
</tr>
<tr>
<td>**闲置 / 离开锁**</td>
<td>**页面隐藏 1h 就锁重签**</td>
<td>**无前端闲置锁**</td>
<td>✅ 唯一的"60s 空闲"是 **WebSocket** 层超时→**自动重连、不重签**</td>
</tr>
<tr>
<td>关标签页(未持久化)</td>
<td>要重设</td>
<td>要重设(agent key 默认存 `sessionStorage`,关标签即销毁)</td>
<td>✅ 参考实现/最佳实践</td>
</tr>
<tr>
<td>清存储 / 换浏览器 / 换设备</td>
<td>要重设</td>
<td>要重设(agent key 不在本机 → 主钱包重签 ApproveAgent)</td>
<td>✅</td>
</tr>
<tr>
<td>页面刷新(已持久化)</td>
<td>不用</td>
<td>不用</td>
<td>✅</td>
</tr>
<tr>
<td>持久化开关</td>
<td>Remember session(sessionStorage↔localStorage)</td>
<td>Stay Connected / Persist Trading Connection(同理)</td>
<td>✅ 实测</td>
</tr>
</table>
**两个最重要的结论:**
1. **HL 没有"离开电脑就锁"这种闲置锁。** HL 唯一的 60 秒空闲是 WebSocket 连接层超时(自动重连,不弹签名)。**FX100 的 1h 隐藏锁是我们独有的额外严格策略**——HL 靠"agent 只能交易不能提款 + 可 revoke + 长有效期"控风险,而不是靠频繁踢用户重签。是否保留这个 1h 锁,值得团队权衡。
2. **HL "签一次用很久"的三个来源**:①有效期 30–180 天(我们 24h);②无次数上限(我们 90 单);③无闲置锁(我们 1h)。只要不换设备/不清存储/开了 Persist,HL 用户**数周到数月**不用重签;FX100 默认配置下可能**每天 / 每 90 单 / 每次离开 1h**就被要求重签——这就是"总让我签、很烦"的根因。
### 6.5 为什么 FX100 签这么勤?能不能像 HL 一样松?
FX100 现在用"**短有效期 + 次数上限 + 离开锁**"这套高频重签,本质是在**给一个先天较弱的 key 做补偿**:因为 key 是**确定性派生 + 公开地址加密**(见第二部分风险 1/2/3),一旦泄露无法轮换、且泄露门槛低,所以只能用"频繁失效"来压缩暴露窗口。
而 HL 敢用 90 天,是因为它的 agent key **随机生成、可随时换、可 revoke**,泄露了换一个即可,不需要靠短有效期兜底。
> **关键判断**:subaccount / agent **都只能下单、不能提走用户的钱**(FX100 的 subaccount 只能 create/cancel/update order),所以两者"最坏损失"都封在交易层。这意味着 **FX100 完全有条件把有效期放宽到 HL 级别、去掉次数上限和 1h 锁,大幅改善"总让我签"的体验——但前提是先把 key 换成随机 + 强加密(第二部分方案 B),否则放宽有效期会直接放大风险。** UX 和安全在这里是**绑定的**:先修 key,才能安全地少签。
**要"按 HL 那样做",安全上必须满足哪个方案?→ 方案 B(必做前置),配套方案 C。**
<table header-row="true" header-column="false">
<tr>
<td>想放宽的项</td>
<td>必须先满足的前置</td>
<td>为什么</td>
</tr>
<tr>
<td>有效期 24h → 数天/周(HL 30–180 天)</td>
<td>**方案 B:随机 key**</td>
<td>现在短有效期是在补偿"泄露不可轮换"的确定性弱 key;换随机 key 后泄露可换、可 revoke,才敢放长</td>
</tr>
<tr>
<td>长期持久化到 localStorage(默认开 Remember)</td>
<td>**方案 B:强加密口令**(用主钱包签名而非公开地址)</td>
<td>key 在磁盘躺得越久,弱加密的暴露越大;必须先让 "encrypted" 名副其实</td>
</tr>
<tr>
<td>去掉 90 单上限 / 1h 锁</td>
<td>**方案 C:轮换即 revoke 旧 key**(已部分具备)</td>
<td>少了次数/闲置兜底后,"泄露即止血"要靠 revoke 顶上</td>
</tr>
</table>
> 一句话:**方案 B 是"对齐 HL"的硬门槛,方案 C 是配套止血,做完这两个才能安全地执行方案 D(放宽重签频率)。** 方案 A(salt/version)在做了 B 之后即可省略——随机 key 本身就不确定、天然可轮换。
### 6.6 HL 的 AgentAddress 和 Nonce 怎么算?能靠它们保证安全吗?
你观察到"每次重签 AgentAddress 和 Nonce 都在变,而且 Nonce 不是 +1"——完全正确,原因是这两者是**两套不同机制**:
**AgentAddress = 每次全新的随机地址**
- HL 每次授权都**新生成一把随机私钥**(`generatePrivateKey()`,与主钱包无任何数学关系),地址自然每次都不同。
- **这正是方案 B 的做法**,也是 HL 安全性的核心:随机 + 可轮换 + 可 revoke → 泄露一把,换一把、撤一把即可,不会"一次泄露永久受害"。
- 对比 FX100 现状:`keccak256(主钱包签名)` 是**确定性**的,同一钱包永远同一地址,这恰恰是风险 1/2 的根源。
**Nonce = 签名那一刻的毫秒时间戳(不是 +1 计数器)**
- 你看到的 `1784255251467`、`1784258427441` 就是 Unix **毫秒时间戳**(两者差 ≈ 53 分钟,正好是两次签名的间隔)。
- HL 官方规则:nonce 必须在 `(now − 2 天, now + 1 天)` 窗口内、必须**大于该地址最近 100 个 nonce 里最小的那个**、且**未被用过**。用"当前 wall-clock 毫秒"天然满足这些条件。
- 用时间戳而非 +1,是为了支持**并发/多设备/多 bot 同时签**——严格 +1 会强制串行,时间戳窗口允许乱序并发。
- 对比 FX100:合约里 `subaccountApprovalNonces[account]` 是**严格 +1**(`storedNonce + 1`),外加每笔 relay 调用的 **digest 一次性**防重放。对单用户场景这更简单、更安全,**FX100 不需要照抄 HL 的时间戳 nonce**。
**能靠 AgentAddress + Nonce"保证安全"吗?—— 它们各管一段,都不是全部**
- **AgentAddress(随机 + 可撤销)**= 控**爆炸半径**:泄露就换新 + revoke 旧。这是轮换/隔离控制。
- **Nonce**= 只做**防重放**(同一条 approveAgent / 同一动作不能被重复提交)。⚠️ 它**保护不了已泄露的 agent 私钥**——key 一旦外泄,攻击者能一直下单直到过期或被 revoke。而且 HL 文档明确:agent 注销后 nonce 状态可能被清,**旧签名有被重放的可能**。所以 nonce 不是独立的安全保证。
- **真正的安全 = 随机 key(可轮换)+ agent 只能交易不能提款(权限隔离)+ 有效期 + 可 revoke + key 保密**。AgentAddress 和 Nonce 只是其中两块拼图,缺了"随机 key + 权限隔离"这两条,单靠 nonce 无法保证安全。
> **落到 FX100**:我们要学的是 HL 的 **AgentAddress = 随机 + 可轮换**(即方案 B),而不是它的时间戳 nonce(我们的 +1 nonce + digest 防重放已经够用)。安全性的关键从来不在 nonce,而在"key 是不是随机、能不能轮换、权限是否只限交易"。
### 6.7 随机 key 下,旧 Session subaccount 怎么退场?(revoke 原理 + 合约取舍)
> 用随机 key 后每次轮换都是一把新地址,旧的怎么办?这一节讲清 HL 与 FX100 的模型差异、revoke 的链上原理,以及"要不要改合约"。**结论:采用方案一(不改合约)。**
**先厘清一个高频误解:不是每次都要 revoke。** 要区分两个动作:
<table header-row="true" header-column="false">
<tr>
<td>动作</td>
<td>触发</td>
<td>换随机 key?</td>
<td>revoke?</td>
</tr>
<tr>
<td>**Renew 续期**</td>
<td>24h 到期 / 90 单用完(**常态、高频**)</td>
<td>❌ 沿用同一把 key</td>
<td>❌ 仅重签 approval(nonce+1、续 expiresAt/次数)</td>
</tr>
<tr>
<td>**Rotate 轮换**</td>
<td>用户手动 Clear / 怀疑泄露(**少见、低频**)</td>
<td>✅ 生成新随机 key</td>
<td>视情况(见下)</td>
</tr>
</table>
日常到期是 **Renew,不换 key、不 revoke**(和 HL 的 agent 在 30–180 天有效期内不中途换 key 一致)。只有**低频的 Rotate** 才涉及 revoke。
**两种链上模型的差异(为什么 HL 不用手动 revoke):**
<table header-row="true" header-column="false">
<tr>
<td></td>
<td>Hyperliquid(unnamed agent)</td>
<td>FX100(现状)</td>
</tr>
<tr>
<td>授权存储</td>
<td>**单槽覆盖**:unnamed 槽只有 1 个</td>
<td>**集合累加**:`subaccountListKey` 是 set,可同时授权多把</td>
</tr>
<tr>
<td>注册新 key</td>
<td>**自动替换旧的**(同名 approveAgent 覆盖)</td>
<td>**追加进 set**,旧的不受影响</td>
</tr>
<tr>
<td>旧 key 退场</td>
<td>被新的覆盖,L1 保证只认最新</td>
<td>靠**各自 24h 到期**或**显式 \`removeSubaccount\`**</td>
</tr>
<tr>
<td>是否需单独 revoke tx</td>
<td>不需要</td>
<td>Rotate 时需要(或等 24h 到期)</td>
</tr>
</table>
> 重要细节:FX100 的到期判断在**下单动作**时执行(`_validateSubaccountActionCountAndExpiresAt`),**过期的 key 即使还在 set 里也无法下单**。所以旧 key 在 24h 后自动失效——**不 revoke 也不会被滥用**;revoke 的价值是"24h 内提前立即切断"+ 清理 set。
**revoke 的链上原理:**
```plain text
主钱包发 tx → SubaccountUtils.removeSubaccount
            → dataStore.removeAddress(subaccountListKey(account), subaccount)  // 从授权 set 删除
之后该 key 下单 → validateSubaccount 失败 → revert SubaccountNotAuthorized
```
- 是一笔**真实链上交易**,主钱包**弹窗签名 + 付 gas**(截图里 `to: 0xede890…BBc2`、`data: 0x712182eb…` 即此)。
- 合约另有 **gasless 版** `SubaccountRelayRouter.removeSubaccount(relayParams, account, subaccount)`:主钱包只签消息、keeper 广播,**免 gas**。现在 `revokeAndClear()` 用的是直发版,将来可切 relay 版。
**要不要改合约?两个方案 + 采用结论:**
**✅ 方案一(不改合约,已采纳)**
- 靠"**Renew 不换 key、Rotate 才 revoke**":日常零 revoke,只有手动清除/疑似泄露才发一笔 revoke;配合方案 B(随机 key),安全性已达 HL 同级,24h 到期本身兜底"旧 key 自动死"。
- 小优化:把 revoke 切到 **gasless relay 版**,连那笔偶发的 revoke 都免 gas。
- 天然支持**多设备同时在线**(set 模型下手机+电脑各一把 key)。
- **不动已审计的共享合约**,风险最低。
**⚪ 方案二(改合约,可选,想要 HL 那种"零额外 tx、永远只认最新")**
- 把 set 改为**单槽覆盖**:`mapping(account => address activeSubaccount)`,`handleSubaccountApproval` 覆盖写入,`validateSubaccount` 改为 `== activeSubaccount[account]`。
- 效果:注册新 key **自动废掉旧 key**,Rotate 不需要单独 revoke tx,与 HL unnamed agent 完全一致。
- 代价:**每账户同时只能 1 把 key(单会话)**,别的设备登录会踢掉当前;要多设备需折中"最多 N 把、超了删最旧"。
- 需要**改动合约 + 重新过审计**。
> **采用**:**方案一 + revoke 切 gasless relay 版**。原因:Renew 沿用同一把 key 已让 revoke 变成低频操作,不值得为它改动已审计的共享合约。若产品中期明确要"严格单会话 + 零额外签名",再评估方案二。 **不变的前提**:无论 set 还是单槽,**方案 B(随机 key)都是根本安全线**;set/单槽只决定"旧 key 怎么退场",不改变"key 必须随机"。
### 6.8 HL 关浏览器后为什么不用"解锁签名"?——它的取舍
关键认知:**"读 key 不用签名"和"用钱包签名加密 key"是互斥的,不能既要又要。**
- HL 开了 Persist 后,是把 agent key **直接存 localStorage、读回来直接用**(明文或本地轻加密),读取**不需要任何钱包交互** → 所以没有解锁签名。
- 代价:**HL 不靠"磁盘强加密"保安全**,而是靠三条兜底——① agent **只能交易、不能提款**;② 有效期;③ 可 revoke。
- 还有个现实:攻击者若能读你 localStorage(XSS/恶意插件),在你**开着页面时本就能借活跃 session 直接下单**,与 key 怎么加密无关;强加密只多防"把存储 blob 拷走、关页面后/换地方再用"这个较窄场景。
**三个选项(体验从顺到严):**
<table header-row="true" header-column="false">
<tr>
<td>选项</td>
<td>做法</td>
<td>解锁签名</td>
<td>抗"拷走 blob 离线用"</td>
</tr>
<tr>
<td>**① 完全学 HL(采用)**</td>
<td>随机 key + 存储无签名读回(沿用现有 AES-地址口令 / 或明文)</td>
<td>❌ 无</td>
<td>弱(同 HL)</td>
</tr>
<tr>
<td>② 中间路线</td>
<td>随机 key + WebCrypto 不可导出密钥(存 IndexedDB)</td>
<td>❌ 无</td>
<td>中(密钥材料拷不走,本机可用)</td>
</tr>
<tr>
<td>③ 最严</td>
<td>随机 key + 主钱包签名当口令</td>
<td>✅ 重启后要签一次</td>
<td>强</td>
</tr>
</table>
> **采用①(完全学 HL)**:随机 key 是真正的安全升级(修风险 1/2);风险 3(磁盘加密)**跟 HL 一样接受**——对一个只能交易、可撤销、会过期的 key,磁盘强加密的边际价值有限。若日后想再稳一档又不加签名,可评估②。 **配套**:UI 那句 `The key is encrypted...` 要**改软**,别用 "encrypted" 给超出实际的安全感(见第三部分文案表)。
### 6.9 我们的问题里,哪些是 GMX 继承的、哪些是我们自己加严的?
FX100 的 1CT 是 **GMX 的逐字节克隆**(`generateSubaccount`、`SUBACCOUNT_MESSAGE`、AES-地址加密均与 GMX 上游源码一致)。但要分两块看:
**① 安全问题 = 从 GMX 原样继承(GMX 也全有)**
<table header-row="true" header-column="false">
<tr>
<td>问题</td>
<td>FX100</td>
<td>GMX</td>
</tr>
<tr>
<td>风险 1 确定性派生 key(`keccak256(签名)`)</td>
<td>有</td>
<td>✅ 一样有</td>
</tr>
<tr>
<td>风险 2 消息无域名绑定(钓鱼可复算)</td>
<td>有</td>
<td>✅ 一样有</td>
</tr>
<tr>
<td>风险 3 AES 用公开地址当口令(≈没加密)</td>
<td>有</td>
<td>✅ 一样有</td>
</tr>
</table>
这三条是整个 GMX 派系的通病,GMX 自己也只靠"只能交易 + 会过期 + 可 revoke"兜底,未真正解决。
**② 易用问题("总让我签")= 我们在 GMX 之上又加严了,比 GMX 还烦**
<table header-row="true" header-column="false">
<tr>
<td>项</td>
<td>GMX</td>
<td>FX100(现在)</td>
<td>谁更烦</td>
</tr>
<tr>
<td>授权有效期</td>
<td>**7 天**</td>
<td>**24 小时**</td>
<td>FX100 更烦(短 7 倍)</td>
</tr>
<tr>
<td>次数上限</td>
<td>90</td>
<td>90</td>
<td>一样</td>
</tr>
<tr>
<td>1 小时闲置锁</td>
<td>**无**(据了解)</td>
<td>**有**(我们自己加的)</td>
<td>FX100 更烦</td>
</tr>
<tr>
<td>关标签页</td>
<td>默认 localStorage,**不掉**</td>
<td>默认 sessionStorage,**掉**(除非开保持连接)</td>
<td>FX100 默认更烦(但更安全)</td>
</tr>
</table>
> **结论**:安全弱点是 GMX 的锅(继承);而"签得比谁都勤"是我们自己在 GMX 之上又加了 24h、1h 锁、sessionStorage 默认这几刀——**GMX 用户其实比我们省心**(7 天、无闲置锁、默认不掉)。
**③ 所以做方案 B + 学 HL,是"超越 GMX",不是"补课"**
- 安全上比 GMX **更强**(GMX 仍是确定性弱 key,我们改随机);
- 易用上比 GMX **更顺**(GMX 7 天,我们 90 天;GMX 无 revoke 闭环,我们已有)。
- 改完后这块**领先 GMX、对齐甚至部分超过 HL**,而非停留在"GMX 有的问题我们也有"。
> 确信度:安全三条已对过 GMX 源码,**确定同源**;"GMX 无 1h 闲置锁"为据了解未见此机制(GMX 前端非逐版本开源),标为高度可能而非 100%。
---
# 第二部分 · Flash 1CT Session Key 安全评审
> 评审对象:Flash / One-Click Trading(1CT)的 subaccount(session key)生成、存储、授权与轮换机制 **评审日期:2026-07-17(第二版,已重新拉取 develop 复核)** 代码基线:`origin/develop`,涵盖 flash 生命周期新提交 `bff31de3`(Harden flash subaccount lifecycle)、`2336981a`(Fix 1CT session gate after approval cleanup)、`5d9808db`(Stabilize 1CT session status sync)。 **本轮 develop 的变化(相对第一版)**: - ✅ **风险 4 已修复**:新增 `revokeAndClear()` 真正调用链上 `removeSubaccount`(见下 §三·风险 4)。 - ✅ **新增"Remember session"存储选择**:默认 sessionStorage(关标签页即清),可开启持久化到 localStorage(见 Part 1 §6.3)。 - ✅ **新增完整会话状态机 + 下单前门禁**(`useFlashSessionStatus` / `useFlashOrderGate` / `FlashSessionStatusSync`),把"何时重签"产品化(见 Part 1 §6)。 - ⚠️ **风险 1 / 2 / 3 仍未处理**:派生算法(`keccak256(签名)`)与加密口令(公开地址)**逐字节未变**,建议仍然成立。 复核文件:`subaccountCrypto.ts`、`useSubaccountSession.ts`、`useFlashSessionStatus.ts`、`useFlashOrderGate.ts`、`FlashSessionStatusSync.tsx`、`state/base/subaccount.ts`、`state/ui/flash.ts`、`FlashSettings.tsx`、`configs/express.ts`。 合约侧:`fx100-contracts` `src/router/relay/SubaccountRelayRouter.sol`、`src/subaccount/SubaccountUtils.sol`、`src/router/relay/BaseRelayRouter.sol`
---
## TL;DR(给决策用)
- **当前方案是 GMX 1CT 的逐字节克隆**,安全模型与 GMX 同级,**短期上线可接受**——链上有"过期 + 次数上限 + approval nonce + digest 防重放",前端再加 sessionStorage 默认 + 1h 离开锁,多重兜底,最坏情况被封顶。
- **本轮 develop 已修复第一版风险 4**(新增 `revokeAndClear()` 真正链上 `removeSubaccount`),并新增 "Remember session" 存储选择与完整会话状态机。
- 但仍继承 GMX 两个**未处理的弱点**:
1. **session 私钥是主钱包签名的确定性函数,无法真正轮换**(风险 1/2);
2. **存储里的"AES 加密"用公开的钱包地址当口令,等于没加密**(风险 3)。
- **重签体验**:FX100 现在 **24h 过期 + 90 单上限 + 1h 离开锁**,比 Hyperliquid(90 天、无次数限、无闲置锁)严得多——**这就是用户觉得"总让我签、很烦"的根因**。这套高频失效本质是在补偿上面的弱 key。
- **建议(顺序很重要)**:先做【方案 B】(随机 key + 用签名当加密口令),把 key 换强;**换强之后才能安全地放宽重签频率(方案 D),拿到 HL 级别"签一次用很久"的体验**。顺序反了(先放宽后修 key)会直接放大风险。合约不需要改。
---
## 一、机制现状(代码事实)
### 1.1 session 私钥怎么来的
```plain text
// packages/sdk/src/flash/subaccountCrypto.ts
const pk = keccak256(signature);              // 私钥 = keccak256(主钱包对固定消息的签名)
const subaccount = privateKeyToAccount(pk);
const encrypted = AES.encrypt(pk, ownerAddress).toString();  // 用"主钱包地址"当 AES 口令
```
```plain text
// packages/sdk/src/configs/express.ts
export const SUBACCOUNT_MESSAGE =
  "Generate a fx100 1CT (One-Click Trading) session. Only sign this message on a trusted website.";
```
- 消息是**纯固定字符串**,不含 origin / chainId / nonce / 时间戳。
- `personal_sign`(EIP-191)是**确定性**签名 → 同一主钱包对同一消息永远签出同一个 signature → `keccak256` 永远得到同一私钥。
- 因此:**同一主钱包在任何网站、任何域名、任何时间派生出的 subaccount 地址都相同**。这解释了用户观察到的"两个 URL 的 subaccount 地址一样"——不是 HD path 相同,而是输入完全相同、算法确定。
### 1.2 为什么两个域名要各设一次
session key(加密后)和链下 approval 存在 `subaccountsByOwnerAtom`(默认 sessionStorage,开了 Remember session 才用 localStorage,见 Part 1 §6.3),key 结构是 `makeSubaccountKey(chainId, address)`,**没有 URL 维度**。之所以换域名要重设,是因为 **浏览器存储按 origin 隔离**,`fx100-dev.vercel.app` 与 `fx100-apps.vercel.app` 是两个 origin,互相读不到对方的存储。**不是**"跟 URL 绑定"的逻辑。
### 1.3 链上授权与限制(合约事实)
- `SubaccountRelayRouter._handleSubaccountApproval`:校验 `subaccount` 匹配、`desChainId == block.chainid`、`deadline` 未过期、**approval nonce 严格递增**(`subaccountApprovalNonces[account]`,+1 即让旧 approval 签名失效),再验签。
- `SubaccountUtils`:链上强制 `expiresAt`(过期)+ `maxAllowedCount`(次数上限)双限。
- `BaseRelayRouter._validateCall`:`desChainId` 校验 + `deadline` 校验 + **digest 一次性**(`digests[digest]` 防重放)。
- relay fee 有 `maxFeeAmount` 上限,keeper 无法超额扣费。
- 前端默认:`DEFAULT_APPROVAL_EXPIRY_SECONDS = 24h`(GMX 默认 7 天,fx100 更保守)。
**这些是做得对的地方,是"没崩盘"的根本原因。**
---
## 二、横向对比
<table header-row="true" header-column="false">
<tr>
<td>维度</td>
<td>FX100(现状)</td>
<td>GMX</td>
<td>Hyperliquid</td>
</tr>
<tr>
<td>私钥来源</td>
<td>确定性:`keccak256(签名)`</td>
<td>同 FX100(源码逐字节一致)</td>
<td>**完全随机**生成</td>
</tr>
<tr>
<td>与主钱包关系</td>
<td>主钱包签名的函数</td>
<td>同</td>
<td>无数学关系</td>
</tr>
<tr>
<td>能否轮换</td>
<td>❌ 同主钱包永远同一 key</td>
<td>❌ 同</td>
<td>✅ 随时换随机 key,`approveAgent` 换绑</td>
</tr>
<tr>
<td>授权载体</td>
<td>链下 EIP-712 approval,合约存 set</td>
<td>同</td>
<td>链上 `approveAgent`,最长 180 天</td>
</tr>
<tr>
<td>加密口令</td>
<td>主钱包地址(**公开**)</td>
<td>主钱包地址(**公开**)</td>
<td>随机 agent,无需口令加密的确定性问题</td>
</tr>
<tr>
<td>存储</td>
<td>**sessionStorage 默认 / localStorage 可选(Remember session)**</td>
<td>localStorage</td>
<td>localStorage(Stay Connected)</td>
</tr>
<tr>
<td>默认过期</td>
<td>**24h**</td>
<td>7 天</td>
<td>**90 天**(最长 180d)</td>
</tr>
<tr>
<td>次数上限</td>
<td>**90 单后重签**</td>
<td>有</td>
<td>**无**</td>
</tr>
<tr>
<td>闲置/离开锁</td>
<td>**页面隐藏 1h 即锁**</td>
<td>无</td>
<td>无</td>
</tr>
<tr>
<td>撤销</td>
<td>✅ 链上 `removeSubaccount`(本轮新增)</td>
<td>需前端补</td>
<td>/API 页 revoke</td>
</tr>
<tr>
<td>泄露后果</td>
<td>永久有效,只能改消息全局重来</td>
<td>同</td>
<td>换新 agent + revoke 即可止血</td>
</tr>
</table>
**结论**:
- **安全模型**:与 GMX 同级(实为克隆);与 Hyperliquid 有本质差距——HL 的随机 agent + 可 revoke 是更安全的范式,而确定性派生方案天然做不到。
- **重签体验**:FX100 比 HL 严得多(24h vs 90d、有次数上限、有 1h 锁),用户会明显感到"总在签"。这套严格策略是在**补偿弱 key**;换成随机 key(方案 B)后即可安全地对齐 HL 的宽松体验(见 Part 1 §6.5)。
---
## 三、风险清单(按严重程度)
### 🔴 风险 1 — 确定性派生 = 无法轮换
session 私钥是 `keccak256(personal_sign(固定消息))`。一旦泄露,攻击者拿到的是**永久有效**的 key,除了改消息字符串没有任何办法让它失效,而改消息会让所有旧 subaccount 变孤儿。这是与 Hyperliquid 最大的安全差距。
### 🔴 风险 2 — 消息无域名绑定,钓鱼站可复算同一把 key
消息是纯固定字符串,不含 origin/chainId/nonce。任何网站只要诱导你用主钱包签这条**一模一样**的消息,就能在它自己后端复算出你的 subaccount 私钥。若你**已在链上给该 subaccount 授过权且未过期/次数未用完**,钓鱼站可直接替你下单。EIP-191 personal_sign 不带 domain separator,这个面比 EIP-712 更大。(对应合约工程师担心的"不小心在三方签了这个消息"。)
### 🟠 风险 3 — AES 用公开地址当口令,等于没加密
```plain text
AES.encrypt(pk, ownerAddress)   // ownerAddress 是链上公开信息
```
钱包地址是公开的。任何能读到 localStorage 的东西(恶意浏览器扩展、XSS、共享/被入侵的电脑、云端备份同步)都知道 ownerAddress,可直接解密拿明文私钥。这层"加密"只是**混淆(obfuscation)**,不提供真实机密性。GMX 同样如此,但这只说明是被行业容忍的弱点,不代表安全。
### ✅ 风险 4(第一版)— 旧 key 不会自动清 →**本轮已修复**
第一版指出:`shouldAdd` 只把 subaccount 加进授权 set,重签(nonce+1)只让旧 approval 签名失效,**不会把旧 subaccount 从链上授权 set 移除**。
> **develop 已落地修复**:`useSubaccountSession.revokeAndClear()` 现在会真正发一笔链上 `SubaccountRouter.removeSubaccount(subaccount)` 交易、等回执成功后再清本地存储。设置页的撤销入口即调它。**风险 4 关闭。** 剩余小建议:轮换(生成新 key)时也顺带 revoke 旧的,别只清本地(否则旧 subaccount 仍留在链上授权 set 直到 24h 过期)。
### 缓解现状
最坏情况被 **24h 过期 + 90 单次数上限 + 1h 离开锁 + approval nonce + digest 防重放 + 默认 sessionStorage(关标签页即清)**多层兜底——这是目前方案没有彻底崩盘的根本原因,也是短期可上线的依据。**但这套"高频失效"正是用户抱怨"总让我签"的来源(见 Part 1 §6),且它是在补偿风险 1/2/3 的弱 key;把 key 换强(方案 B)后即可安全地放宽、少签。**
---
## 四、改进方案(按投入产出排序)
### 方案 A(最小改动,建议上线前做)—— 打破确定性 + 加版本
前端提的 `version` 有价值,但**单靠 version 仍是确定性的**,只能"手动全局轮换",不能"每 session 不同"。两步一起做:
1. message 加版本号,允许全局作废重来:
`"Generate a fx100 1CT ... version: 1"`
1. **派生时混入随机 salt**:
```plain text
   const salt = crypto.getRandomValues(...);          // 随机盐
   const pk = keccak256(concat([signature, salt]));   // 打破确定性
   // salt 与加密后的 key 一起存 localStorage
```
这样每次 generate 出的 key 都不同,天然支持轮换。
代价:key 不再能"仅凭签名跨设备恢复"——但现有实现本就存 localStorage、没利用这个特性,**零损失**。
### 方案 B(推荐,向 Hyperliquid 看齐)—— 随机 key + 强口令
```plain text
const pk = generatePrivateKey();  // viem,完全随机
```
- 风险 1、2 直接消失(不可复算、不可被钓鱼站派生)。
- 轮换成常规操作:生成新随机 key → 签新 approval(nonce+1 让旧 approval 失效)→ `removeSubaccount(旧)`。
- 加密口令**别再用 ownerAddress**,改用**主钱包对一条固定消息的签名**当 AES 口令(签名是私密的,不像地址公开),缓解风险 3。
- signature-derived 的唯一好处是"不存储也能恢复",但现有实现明明存了 localStorage,等于**既担了确定性风险、又没享到免存储好处**——改随机 key 是纯收益。
### 方案 C(轮换闭环,配合 A 或 B)—— 本轮已部分落地
前端"轮换 / 撤销"需做三件事:
1. 生成新 key、签新 approval(nonce+1 让旧 approval 失效);
2. 对旧 subaccount 调 **\`removeSubaccount\`**(从授权 set 剔除);— ✅ `revokeAndClear()` 已实现;
3. 清掉旧 key 的存储条目。— ✅ 已实现。
> 现状:**撤销**闭环已通(风险 4 关闭)。**缺口**:轮换(生成新 key)时未自动 revoke 旧 subaccount,旧的仍留在链上授权 set 直到 24h 过期——补上"generate 新 key 前先 revoke 旧的"即完整。
### 方案 D(新增,针对"总让我签"的体验)—— 放宽重签频率,但必须先修 key
用户反馈的"老让我签、很烦"来自 §6 的高频失效(24h + 90 单 + 1h 锁)。**这套严格策略是弱 key 的补偿,不能单独放宽**——否则直接放大风险 1/2/3。正确顺序:
1. **先做方案 B**(随机 key + 强加密),消除"泄露不可轮换"的根;
2. **再放宽**:把授权有效期从 24h 提到数天\~周级(HL 是 90 天)、去掉或大幅调高 90 单次数上限、把 1h 离开锁改成"仅提示不强制"或延长阈值;
3. 依赖已具备的 `revokeAndClear` 作为"泄露即止血"的主手段,替代"靠短有效期兜底"。
> 一句话:**先换强 key,才能安全地少签,拿到 HL 级别的体验。** 顺序反了会出安全事故。
---
## 五、给开发者的处置建议(勾选表)
**已完成(本轮 develop)**
- \[x\] 链上撤销闭环 `revokeAndClear()` → `removeSubaccount`(风险 4 关闭)
- \[x\] "Remember session" 存储选择(sessionStorage 默认 / localStorage 可选)
- \[x\] 会话状态机 + 下单前门禁(setup/renew 引导)
**仍建议做(按优先级)**
- \[ \] **P0**:message 加 `version` 字段(方案 A-1),预留全局作废能力
- \[ \] **P0**:派生混入随机 salt(方案 A-2),打破确定性、可轮换
- \[ \] **P1**:AES 口令从 `ownerAddress` 改为"主钱包签名"(方案 B 口令部分)
- \[ \] **P1**:轮换时自动 revoke 旧 subaccount(方案 C 缺口)
- \[ \] **P2**:整体迁移到随机 agent wallet 模型(方案 B),对齐 Hyperliquid
- \[ \] **P2(体验,依赖上面)**:方案 B 落地后,放宽重签频率(有效期↑、次数上限↑/去除、1h 锁改提示),对齐 HL 的"签一次用很久"
- \[ \] 无需改动合约:`removeSubaccount` 已具备;链上 `expiresAt`/`maxAllowedCount`/nonce/digest 防重放保持不变
---
## 参考
- GMX 上游 `generateSubaccount.ts` / `configs/express.ts`(与本项目实现逐字节一致)
- Hyperliquid Docs — Nonces and API wallets;agent wallet 用 viem `generatePrivateKey()` **随机生成**、`approveAgent` 签一次、**默认 90 天(名字后加 \`valid_until\` 可设最长 180 天)**、同名 `approveAgent` 可替换续期、可在 /API 页 revoke、**无次数上限、无闲置锁**——这是"签一次用很久"体验的来源。
- 本项目 develop 关键提交:`bff31de3`(harden lifecycle)、`2336981a`(session gate)、`5d9808db`(status sync);核心文件 `useFlashSessionStatus.ts` / `useFlashOrderGate.ts` / `FlashSessionStatusSync.tsx` / `state/base/subaccount.ts`。
- 本项目合约:`SubaccountRelayRouter.sol` / `SubaccountUtils.sol` / `BaseRelayRouter.sol`(subaccount 只能 create/cancel/update order,**不能提款**——最坏损失封在交易层)。
---
# 第三部分 · 学 HL 全面改造清单(给前端工程师)
> 目标:把 1CT 改成"**随机 key + 存储无签名读回 + 长有效期 + 无次数上限 + 无闲置锁**",体验对齐 Hyperliquid("设置一次,长期免签"),安全靠"只能交易 + 可撤销 + 会过期"兜底。**合约不改**,改动集中在前端/SDK 6 个文件 + 文案。
> 🚨 **实施必读(最容易漏的坑)**:改了 90 天有效期,**必须同步把 \`SUBACCOUNT_CONFIG_SOFT_TTL_SECONDS\` 从 7 天改到 ≥90 天**(见 A6)。否则本地存储第 7 天就会被清理,90 天有效期 + "保持连接默认开"全部形同虚设——用户第 8 天回来还是要重新设置。这个坑不报错、不显眼,极易被漏掉。
## A. 逻辑改动(按文件)
### A1. 随机 key —— `packages/sdk/src/flash/subaccountCrypto.ts`
- 私钥生成:`keccak256(signature)` → **\`generatePrivateKey()\`**(`viem/accounts`),不再依赖任何签名。
- 地址推导:`privateKeyToAccount(pk)` **不变**。
- 加密存储:**沿用** `AES.encrypt(pk, ownerAddress)`(即"存储无签名读回",解密不弹钱包)。
> 这是"完全学 HL"的选项①:接受磁盘弱加密,靠只能交易/可撤销/会过期兜底(见 §6.8)。
- `generateSubaccountFromSignature({signature, ownerAddress})` → 改成 **\`generateRandomSubaccount(\{ownerAddress\})\`**(去掉 signature 入参)。
- `SUBACCOUNT_MESSAGE` 派生用途消失,可保留常量或删除。
### A2. 生成流程去掉一次签名 —— `apps/fx-base-app/src/hooks/account/useSubaccountSession.ts`
- `generate()`:**删掉 \`walletClient.signMessage(SUBACCOUNT_MESSAGE)\` 这一步**,改为本地 `generateRandomSubaccount({ownerAddress})`。
> **什么是"派生签名"**:现在私钥是"从签名算出来的"——主钱包签固定消息 `SUBACCOUNT_MESSAGE` 得到一串签名,再 `keccak256(签名)` 当私钥。那次签名唯一目的就是"当算 key 的原料",对应 UI 的 "Generate session key" 弹窗。随机 key 直接用 `generatePrivateKey()` 生成,**不再需要这次签名**。 收益:setup 从"签消息 + 签 approval"两签 → **只剩 approval 一签**(首单再加一次性 USDC permit)。"Generate session key" 步骤变成本地瞬时完成、无弹窗。
- `getSigner()`:**不变**(仍用 ownerAddress 解密,无签名)。
- ⚠️ **轮换即撤销**:若在已有 key 时再次 `generate()`(如"断开后重连"),因有效期改成 90 天,旧 subaccount 会在链上活很久 → **必须先对旧的 \`revokeAndClear()\` 再生成新的**。正常"续期"不走这里(见 A3)。
### A3. 有效期 90 天 + 续期沿用同一把 key —— `apps/fx-base-app/src/components/features/settings/FlashSettings.tsx`
- `DEFAULT_APPROVAL_EXPIRY_SECONDS`:`24n*60n*60n` → **\`90n\*24n\*60n\*60n\`**(90 天)。
- 确认"Renew/续期"沿用当前 key、只重签 approval(现状即如此,勿改成重新 generate)。
### A4. 次数无上限 —— `apps/fx-base-app/src/state/ui/flash.ts`
- `FLASH_ACTION_GRANT_PER_APPROVAL`:`90n` → **\`1_000_000n\`**(对人类≈无限,且避免真·无限带来的边界/溢出)。
> 合约 `maxAllowedCount` 是累加型,每次 approval 签 `onChainActionCount + GRANT`,给一个大数即长期不触顶。
### A5. 去掉 1 小时闲置锁(✅ 已定:去掉)—— `useSessionLockGuard.ts` / `state/base/sessionLock.ts`
- **HL 没有闲置锁**。**产品已确认去掉** → **停用 \`useSessionLockGuard\`**(在 `wallet-providers.tsx` 不再挂载),或把 `LOCK_THRESHOLD_MS` 拉到无意义的大值。
- `useFlashSessionStatus` / `useFlashOrderGate` 里 `locked` 分支随之失效(可保留代码,永不命中)。
> 这是主动放弃一层保护,但因 key 已随机 + 可撤销 + 只能交易,与 HL 一致地移除是自洽的,产品已拍板采用。
### A6. 存储保活期对齐 90 天(**关键坑,别漏**)—— `apps/fx-base-app/src/state/base/subaccount.ts`
- `SUBACCOUNT_CONFIG_SOFT_TTL_SECONDS`:`7*24*60*60`(7 天)→ **\`≥ 90\*24\*60\*60\`**。
> ❗ 不改这个,即使 approval 有效期 90 天,**本地 config 也会在第 7 天被 prune 掉**,session 提前失效,前功尽弃。
- `SUBACCOUNT_APPROVAL_GRACE_SECONDS`(24h 宽限)可保留或酌情放大。
- `persistSubaccountAtom` 默认值:**✅ 已定改为 \`true\`(默认开"保持连接")**——比 HL 的默认关更顺,配合大白话文案"Stay connected"。
### A7. 提醒阈值 —— `apps/fx-base-app/src/hooks/account/useFlashSessionStatus.ts`
- `EXPIRING_SOON_THRESHOLD_SEC`:`4*3600`(4h)→ **如 \`3\*24\*3600\`(到期前 3 天提醒)**。
- `LOW_ORDER_COUNT_THRESHOLD`(≤10 单提醒)在无上限后基本不触发,可保留。
### A8.(可选)撤销走 gasless —— `revokeAndClear()`
- 现用直发版 `SubaccountRouter.removeSubaccount`(要 gas + 弹窗);可切 `SubaccountRelayRouter.removeSubaccount`(签消息、keeper 广播、免 gas),体验更顺。
## B. 文案改动(大白话,去技术黑话)
**原则**:用户看得懂 \> 术语准确。`session` / `subaccount` / `1CT` 都是黑话,面向用户一律避免。
<table header-row="true" header-column="false">
<tr>
<td>位置</td>
<td>现在</td>
<td>建议(大白话)</td>
<td>说明</td>
</tr>
<tr>
<td>持久化开关(你提的 "Stay flash 1CT")</td>
<td>Remember session</td>
<td>**Stay connected**(或"关闭页面后保持开启")</td>
<td>`1CT`/`session` 都是黑话;`Stay connected` 用户最熟(同 HL);中文"保持连接"</td>
</tr>
<tr>
<td>开关副文案</td>
<td>Keep your 1CT session key after closing this tab. The key is encrypted and stored only on this device.</td>
<td>**"Stay connected after you close this tab, so you don't have to set up again. Only this device can use it."**(中文:"关闭页面后保持开启,下次无需重新设置。仅本设备可用。")</td>
<td>**去掉 "encrypted"**(选项①是弱加密,勿夸大,见 §6.8)</td>
</tr>
<tr>
<td>断开按钮(你提的 "Clear subaccount")</td>
<td>Clear session</td>
<td>**Disconnect**(中文:"断开 / 关闭一键交易")</td>
<td>`subaccount` 比 `session` 更黑话,别用;这个动作=撤销+清本地=彻底关掉</td>
</tr>
<tr>
<td>断开确认</td>
<td>Confirm clear</td>
<td>**Confirm disconnect**(中文:"确认断开")</td>
<td></td>
</tr>
<tr>
<td>断开说明</td>
<td>This will revoke the subaccount on-chain, then remove your local 1CT session.</td>
<td>**"This turns off One-Click Trading: it revokes this device's trading key on-chain and removes it from your browser. You can turn it back on anytime."**(中文:"这会关闭一键交易:在链上撤销本设备的交易密钥并从浏览器移除,随时可重新开启。")</td>
<td></td>
</tr>
<tr>
<td>密钥行标签</td>
<td>Session subaccount</td>
<td>**Trading key (this device)**(中文:"交易密钥(本设备)")</td>
<td>`subaccount` 是黑话</td>
</tr>
<tr>
<td>状态</td>
<td>Approved / Needs approval / Inactive</td>
<td>**Active / Setup needed / Off**(中文:"已开启 / 待设置 / 未开启")</td>
<td></td>
</tr>
<tr>
<td>首单提示</td>
<td>Your first trade will require a one-time USDC approval signature.</td>
<td>**"Your first trade needs a one-time USDC approval (one signature)."**(中文:"首次交易需一次性 USDC 授权(签一次)。")</td>
<td></td>
</tr>
<tr>
<td>setup 步骤</td>
<td>Generate session key / Sign approval</td>
<td>因随机 key 后"生成"是本地瞬时:可合并为单步 **"Enable One-Click Trading"**(仅 1 次签名);或"Create key(即时)→ Approve(签 1 次)"</td>
<td></td>
</tr>
<tr>
<td>次数行</td>
<td>Orders left: 90</td>
<td>无上限后**隐藏该行**,或显示 "Unlimited"</td>
<td></td>
</tr>
<tr>
<td>有效期行</td>
<td>Expires in 23h 59m</td>
<td>保留(现在会显示"89d …")</td>
<td></td>
</tr>
</table>
> i18n:`en/ja/ko/zh` 四个 locale 同步改(`persistSession`/`clearSession`/`sessionSubaccount`/`statusApproved…`/`firstTradeNote` 等 key)。
## C. 产品决策(✅ 已全部拍板,2026-07-17)
<table header-row="true" header-column="false">
<tr>
<td>决策项</td>
<td>结论</td>
</tr>
<tr>
<td>A5 去掉 1h 闲置锁</td>
<td>✅ **去掉**(对齐 HL)</td>
</tr>
<tr>
<td>`persistSubaccountAtom` 默认</td>
<td>✅ **默认开**(保持连接)</td>
</tr>
<tr>
<td>有效期</td>
<td>✅ **90 天**</td>
</tr>
<tr>
<td>次数上限</td>
<td>✅ **1_000_000(≈无限)**</td>
</tr>
</table>
前端可照本清单直接实施,无遗留待定项。
## D. 明确不动的地方
`signApproval`(EIP-712)、`submitFlashOrder`、keeper 客户端、relay 参数、**所有合约**、approval nonce / digest 防重放——全不改,因为它们只认地址和 account,不关心 key 出身。
## E. 交互重设计:1CT 隐形默认(Enable Trading + Establish Connection)—— 已实现
> 目标:像 HL 一样,**平时看不到任何 Flash 设置**;用户只跟一个主按钮打交道,会话细节全收进 Settings。已实现于 `feat/flash-1ct-hl-style`(命名 agent 之前的现有单随机 key 版本)。
**E.1 主按钮状态机**(1CT 为默认且隐形)
<table header-row="true" header-column="false">
<tr>
<td>场景</td>
<td>按钮</td>
<td>点击</td>
</tr>
<tr>
<td>无会话(首次)</td>
<td>**\`⚡ Enable Trading\`**</td>
<td>开 **Establish Connection** 弹窗</td>
</tr>
<tr>
<td>已激活 + 表单有效</td>
<td>`⚡ Place Buy/Long`(带闪电,不变)</td>
<td>正常下单(首单多一次一次性 USDC 授权)</td>
</tr>
<tr>
<td>已过期</td>
<td>**\`⚡ Reconnect to trade\`**</td>
<td>开 Establish Connection(重连文案)</td>
</tr>
<tr>
<td>即将过期(\<3天)</td>
<td>照常下单</td>
<td>**表单不提示**,仅 Settings 显示剩余有效期</td>
</tr>
<tr>
<td>Standard 模式</td>
<td>`Place Buy/Long`(无闪电)+ 按钮附近 `⚡ 切换到一键交易`</td>
<td>点入口直接切 1CT</td>
</tr>
</table>
**E.2 Establish Connection 弹窗**(替代原来的完整 Flash settings 面板)
- 轻量弹窗:标题 + 一行说明 + **Stay connected 开关**(默认开)+ 一个 **"Establish Connection"** 按钮。
- **不自动签名**:用户显式点按钮才触发"本地生成随机 key(无弹窗)+ 签一次授权"。
- ✅ **成功后关闭弹窗,按钮变回正常 CTA,用户再点一次才下单**——刻意如此,**防止误点直接下单**(产品决策)。
- 过期走同一弹窗(文案改"重新连接");同一把 key 续签,USDC 授权已做过不再需要。
**E.3 模式切换**
- **1CT 模式**:表单**不显示**任何 Flash 切换(干净);要切到 Standard → 只在 **Settings**。
- **Standard 模式**:表单在**下单按钮附近**显示 `⚡ 切换到一键交易`,点了直接切回 1CT(下一笔即 Enable Trading 流程)。
**E.4 快过期/续期**
- **即将过期(\<3天)**:不打断交易;**表单无提示**,仅 Settings 设备卡显示剩余有效期(产品决策)。
- **已过期**:主按钮自动变 `Reconnect to trade` → 走 Establish Connection 重连 → 再点一次下单。不做过期前自动偷偷续签(避免意外弹钱包)。
**E.5 代码改动(实现参考)**
- 新增 `EstablishConnectionModal.tsx`(轻量弹窗 + generate→签名状态机)。
- 抽出 `lib/flash/signFlashApproval.ts` 共享助手(弹窗与 Settings 共用签名逻辑,去重)。
- `FlashStatusChip.tsx`:1CT 隐藏;仅 Standard 显示"切换到一键交易"入口(点击 setFlashMode('1ct'))。
- `OrderForm.tsx`:主按钮 CTA(`flashSetupCta`→"Enable Trading"、`flashRenewCta`→"Reconnect")+ 打开 EstablishConnectionModal(替代旧的 FlashSettings autoStart 弹窗)。
- 文案 en/zh/ja/ko 四语补齐(`establishTitle/Desc/Cta`、`reconnectTitle/Desc/Cta`、`switchToOneClick`)。
---
# 第四部分 · 随机 key 的孤儿风险 + 多设备 + 合约改进(给合约工程师)
> 前端改用随机 key(第三部分)后带出一个新问题:**旧 key 对应的 subaccount 会作为"孤儿"永久留在链上授权 set 里**。本部分记录风险、合约现状(已核对源码)、合约工程师的解释与改进方向评估、两个设计方案取舍、以及多设备的正确做法。
## 4.1 风险:随机 key 引入"孤儿 subaccount"
- 随机 key 模式下,只要用户**下过至少一单**(approval 懒提交、subaccount 真正注册上链),那把 subaccount 就**永久留在授权 set**,直到显式 remove 或过期。
- **没开 Stay connected + 关标签页** → key 从 sessionStorage 清掉 → 下次生成**新随机 key** → 旧的成**孤儿:链上仍授权、有效期 90 天、额度 100 万**。
- **前端丢了 key 甚至连地址都不记得** → 单个 `removeSubaccount` 帮不上(得知道地址)→ **需要按 account 一键清空的 \`revokeAll\`**。
- 确定性 key 时代无此问题(永远同地址、只有一把)。**随机 key 修好了"泄露不可轮换",却引入了"孤儿堆积"。**
- ⚠️ **与 90 天有效期强耦合**:旧版 24h 孤儿一天自灭,现在孤儿能存活 90 天;100 万额度又移除了"次数耗尽自停"的自然闸。**所以 90 天必须配下面的"默认排他"或 revokeAll 才闭环。**
## 4.2 合约现状(已核对 `SubaccountUtils.sol` 源码)
- **无 \`revokeAll\`**,只有单个 `removeSubaccount(subaccount)`。
- `removeSubaccount` **只从 set 删地址**,不清 `expiresAt / maxAllowedCount / actionCount` 这些 field。
- `validateSubaccount` **只查 set 成员**;过期在 `_validateSubaccountActionCountAndExpiresAt`(下单动作时)另查 → **过期的孤儿不能下单,但仍占 set**(gas/枚举负担)。
- set 模型、**无排他**,同 account 可同时多个。
## 4.3 合约工程师的 4 条解释(核对结论:全部属实)
1. 不主动清理、保留历史 key —— ✅(set + 无 TTL)。
2. Reader 只能按 account+subaccount **成对**查、无法枚举 —— ✅(所以发现不了孤儿,鸡肋)。
3. 无排他、可并存多个 —— ✅(累积根源)。
4. remove 只删 key、不清其他 field,再授权可能继承 —— ✅**且重要**:`actionCount` 不重置,自带固定子账号重新授权时会继承旧计数(可能一加回来就 limit-reached)。对随机 key 无所谓,对"用户自带固定子账号"是隐性 bug,应在 remove 时一并清 field。
## 4.4 合约工程师的改进方向 + 评估
<table header-row="true" header-column="false">
<tr>
<td>改进</td>
<td>评价</td>
<td>补充</td>
</tr>
<tr>
<td>**①revokeAll**(不授权新 key 就清空 account 所有 subaccount)</td>
<td>✅ 必做,panic 按钮</td>
<td>需定**清不清当前那把**(疑似泄露=含当前;清旧设备=不含当前)</td>
</tr>
<tr>
<td>**②授权带 \`exclusive\` bool(默认 true=清旧)**</td>
<td>✅ **最优,主力方案**</td>
<td>=轮换即自动清旧、单 tx、无需单独 revokeAll,对齐 HL 单槽;高级用户关掉保多设备</td>
</tr>
<tr>
<td>**③操作时自动清过期 key + 区分临时/固定 key**</td>
<td>✅ 卫生,次要</td>
<td>每单遍历加 gas,建议 bounded/惰性</td>
</tr>
<tr>
<td>**④Reader 返回全部 subaccount(分页)**</td>
<td>✅ 需要</td>
<td>多设备管理 UI 依赖它</td>
</tr>
</table>
> **横切技术建议(避免 gas/DoS)**:revokeAll / exclusive-清旧 若**遍历 set** 删除,set 太大会超 block gas。更优雅用 **per-account epoch/generation 计数器**:`validateSubaccount` 要求注册 epoch == 当前 epoch;revokeAll / 排他 = **epoch+1,O(1) 作废全部旧的**,无需遍历。
## 4.5 还没提到的风险(补充)
1. **"Disconnect" 只撤当前、不撤孤儿**:现前端断开只 `removeSubaccount(当前)`,历史孤儿一个不清。
2. **前端可用的 interim(不改合约先缓解)**:`removeSubaccount` 只需**地址**、主钱包签名 → 前端可在 localStorage 单存一份**历史 subaccount 地址列表**(session key 清了地址仍在),提供"撤销以前所有 key"逐个 remove,并在 rotate 时先撤上一把。**局限**:换设备/清空整个浏览器存储后地址也没了 → 那些孤儿只能靠合约 `revokeAll`。
3. **exclusive 默认会静默踢掉其他设备**:桌面在用、手机一 setup 就清了桌面 → 需 UX 提示。
4. **非排他多设备 + per-account nonce 竞争**:`subaccountApprovalNonces[account]` 按 account,多设备并发签 approval 可能撞 nonce。
## 4.6 两个设计方案取舍
- **方案 1 · 单槽覆盖(=HL 网页默认)**:永远 1 把 active,新授权覆盖旧的 → **零孤儿**;不支持多设备。
- **方案 2 · 多 subaccount + epoch**:同 epoch 下可多把(多设备),revokeAll=epoch+1 一次性作废;支持多设备。
**关键:方案 1 直接消灭"用户搞不清要不要 revokeAll"的 UX 死结**——只有一把、没有孤儿、不需要历史列表/active 列表/让用户判断。方案 2 则**必须**暴露管理 UI,而普通用户看不懂 `0x4a03...`,等于把安全负担甩给搞不清状况的用户。
> **落地建议**:用工程师的 **② exclusive bool(默认 true)**一个机制同时覆盖两者——默认排他=方案 1(零孤儿、零管理、set 恒为 1、连 gas 都不用担心);高级 `exclusive=false`=方案 2(多设备,用户自愿承担管理)。 **revokeAll 的 UX**:别叫"撤销 subaccount/管理授权"(黑话),用登录心智 **"在所有设备上退出 / Sign out everywhere"**——用户能做"我要全部退出"的决策,做不了"这个 0x4a03 是不是我的"的判断。
## 4.7 多设备的正确做法:HL named agent,不是确定性 key
**HL named agent 机制**:`approveAgent` 的 `agentName` 是**槽位标识**(1 unnamed + 最多 3 named);**同名覆盖**;每台设备用不同名字(desktop/mobile)、各自**随机 key**、各自授权、并存。本质 = **"少量、命名、各自单槽覆盖的随机 key"**——名字人类可读,撤销时面对 "desktop" 而非 `0x4a03...`,数量有上限,不堆孤儿。若做多设备,**该抄这个**。
**为什么不能退回确定性 key 换"免费多设备"**:确定性 key 确实天生多设备 + 零孤儿,但代价是**用户无法自救**的风险:
<table header-row="true" header-column="false">
<tr>
<td></td>
<td>随机 key</td>
<td>确定性 key</td>
</tr>
<tr>
<td>多设备</td>
<td>需 named 槽/单设备</td>
<td>✅ 天生</td>
</tr>
<tr>
<td>孤儿</td>
<td>有但**可解**(默认排他=零)</td>
<td>✅ 无</td>
</tr>
<tr>
<td>**泄露后能否自救**</td>
<td>✅ 换新 key+revoke 干净恢复</td>
<td>❌ **不能**:revoke 后重设**确定性又派生回同一把**、首单又授权 → 泄露的 key 又生效;只能全站改消息(单用户做不到)</td>
</tr>
<tr>
<td>钓鱼场外复算</td>
<td>✅ 不可能</td>
<td>❌ 固定消息无域名绑定,钓鱼站可后端复算出私钥</td>
</tr>
<tr>
<td>提款风险</td>
<td>都不行(只能交易)</td>
<td>都不行</td>
</tr>
</table>
> **本质**:随机的"孤儿"是工程/UX 上**可解**的;确定性的"泄露不可救 + 钓鱼复算"是用户层面**根本无解**的。两者都因 subaccount 只能交易不能提款而封顶(最坏是被恶意下单骚扰、非盗币),但确定性在"泄露/钓鱼"轴上**严格更弱**——这正是当初(及 HL)选随机的原因。
## 4.8 结论与顺序
**三路取舍(按推荐度)**:
1. **单把随机 + 默认排他(方案 1)** ← 推荐默认:最简、零孤儿、零管理 UI、泄露可自救;代价仅"单设备"。
2. **命名随机 agent(HL named)** ← 若确实要多设备:多设备且可管理、可轮换;合约需做"按 name 的槽"。
3. **确定性 key** ← **不建议**:对 C 端不合适(泄露不可救 + 钓鱼复算)。
**顺序依赖(重要)**:
- 合约 **exclusive-默认(或 revokeAll)** 应**先于/同步于** 90 天有效期上线;否则 90 天 = 放大孤儿窗口。
- 合约排他上线前,前端要么把 90 天**临时调短**、要么加 **§4.5 的 interim**(历史地址列表 + rotate 先撤 + "在所有设备退出")兜底。
- 合约排他上线后,前端授权默认传 `exclusive=true`,90 天才安全。
**合约优先级**:② exclusive-默认(根本解)\> ① revokeAll(panic/清理,用 epoch 实现 O(1))\> ④ Reader 枚举(管理 UI)\> ③ 自动清过期;并在 remove 时**一并清 field**(修 ④ 的隐性 bug)。
<page url="https://app.notion.com/p/3a93d7873f2c8161a838e00fb94901e9">FX100 Flash 1CT · 同意与风险披露(给前端 + 合规)</page>

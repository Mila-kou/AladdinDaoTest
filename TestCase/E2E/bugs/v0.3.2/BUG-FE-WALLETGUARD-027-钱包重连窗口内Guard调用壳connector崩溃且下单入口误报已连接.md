---
id: BUG-FE-WALLETGUARD-027
title: wagmi 重连窗口内 WalletChainResyncGuard 对 cookie 还原的壳 connector 调 getProvider 崩溃；同一窗口内下单入口按「已连接」呈现，点击后先 Calculating 再报 Please connect your wallet
severity: S2
priority: P1
status: open
found: 2026-09-09
env: https://testnet.fx100.club/trade?market=BTCUSDC · Base Sepolia 84532 · 前端 fx100-apps@develop（线上 chunk 3fx20iozw61qn.js，与本地 25853155 同源；上游 b4331c15 该文件无改动）· Chrome 152 / Windows · MetaMask 扩展
source-case: 用户工单 FX100-APPS-3J（2026-09-09 02:21 北京时间，Replay c4a357e7…，Trace d700eeca…）
finder: 源码定位 + 本地 wagmi 复现脚本 + Sentry 事件原始 JSON 核对（2026-09-09）；线上现场未复现（浏览器面板无钱包扩展，重连窗口过短）
related: Sentry FX100-APPS-4（TypeError）· FX100-APPS-9（MetaMask）· FX100-APPS-6（Replay 内占大头，与钱包无关，建议另立单）
---

# BUG-FE-WALLETGUARD-027 · 重连窗口里的假连接

> **状态说明**：Guard 崩溃部分为**源码级实锤 + 本地 wagmi 复现 + Sentry 源码映射栈帧**；MetaMask 报错已由 Sentry 原始栈帧**确认为 MetaMask 扩展自身**；「下单入口误报已连接」部分为源码推导，待前端修复后按 §七验收。

## 一、结论（给前端）

| 工单里的现象 | 判定 | 说明 |
|---|---|---|
| `TypeError: r.getProvider is not a function`（WalletChainResyncGuard.tsx） | **前端缺陷，已定位** | `r` = 压缩后的 `connector`；wagmi `reconnecting` 态下它是 cookie 还原的壳对象，没有方法。Sentry issue **FX100-APPS-4**：源码映射栈帧 `WalletChainResyncGuard.tsx:37`，由第 63 行 visibilitychange 监听器调起；近 14 天 1.4K 次；3 周前曾被标 Resolved 后 Regressed |
| `Failed to connect to MetaMask` | **已确认：MetaMask 扩展自身报错，非前端代码** | Sentry issue **FX100-APPS-9** 原始栈帧：`at Object.connect (chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js:7:84292)`，该扩展 ID 即 MetaMask 官方扩展；链式内层错误 `Error: MetaMask extension not found`（同一脚本第 4 行），即注入脚本连不上扩展后台。近 14 天 1.6K 次、跨多国多浏览器版本，不是该用户个例。应用源码、线上 chunk、全部 node_modules 均不含该字符串（含拼接形式） |
| 下单没有到 Relay、无交易哈希 | **前端呈现缺陷放大了钱包侧故障** | 重连窗口内头部显示 cookie 地址、按钮可点；`submitOrder` 因 `walletClient` 为空失败，用户看到「Please connect your wallet」却明明「已连接」 |
| 4 次 `/api/relay/nonce` 200 | 不能证明进过下单流程 | `FlashSessionStatusSync` 在 cookie 地址一出现就查 nonce，不需要真连接 |
| Replay「51 次错误」的构成 | **工单摘要有偏差** | Replay 错误列表实际：TypeError **4** 次（01:52 / 02:09 / 04:04 / 05:29）、MetaMask **6** 次（00:43×2 / 05:30×2 / 05:43×2），其余 **40 余次**是另一个错误 **FX100-APPS-6**「The source … has not been authorized yet」（应用包 `page.js` 抛出的未处理 rejection，14 天 11K 次，与钱包无关，建议另立单）。05:29 TypeError → 05:30 MetaMask 失败的先后顺序，与「切回页面触发 Guard 崩溃，紧接着重连失败」一致 |

一句话：**Guard 的 TypeError 本身不阻断下单，是症状；阻断下单的是 MetaMask 扩展自己的连接故障；前端要修的是 Guard 崩溃 + 重连期间的假连接呈现。**

## 二、机制（为什么会这样）

1. **cookie 持久化 + SSR**：`src/app/wagmi.ts:143-146` 用 `createStorage({ storage: cookieStorage })` 且 `ssr: true`；`src/app/(app)/layout.tsx` 读 `wagmi.store` cookie → `cookieToInitialState()` → `<WagmiProvider initialState>`。
2. **页面一加载即 `reconnecting`**：`WagmiProvider` 的 `reconnectOnMount` 默认 true（wagmi/src/hydrate.ts:13），`@wagmi/core` `hydrate()` 把 `status` 置为 `'reconnecting'`、`connections` 直接用 cookie 内容。
3. **cookie 里的 connector 是壳**：`@wagmi/core` `createConfig.ts:221-236` 的 `partialize` 只保留 `{ id, name, type, uid }`。
4. **`useAccount()` 在这个态下是假连接**：`getAccount.ts:86-98` 的 `reconnecting` 分支返回 `isConnected: !!address`、`connector: connection?.connector`（壳）。wagmi 自己的错误文案就写明：「During the reconnection step, the only connector methods guaranteed to be available are: id, name, type, uid」（errors/config.ts:92-103）。
5. **Guard 没防这个态**：`src/components/providers/WalletChainResyncGuard.tsx:31-34` 只判 `isConnected && connector` 就调 `connector.getProvider().catch(...)`。`getProvider` 不是函数 → **同步抛错，`.catch` 挂不上**；该 async 函数由 `focus` / `visibilitychange` 监听器直接调用、不 await → 未处理 rejection → Sentry。用户在页面与 MetaMask 弹窗间每切一次就多一条。
6. **重连期间 UI 是假的**：`hooks/trade/useOrderFormController.ts:2415` 按钮文案只看 `isConnected`；`hooks/trade/useCreateOrder.ts:1085` 的 `submitOrder` 先把弹窗置为 `calculating`，再因 `!walletClient` 走 `failSubmission('trade.connectWallet')`（en.ts:359 "Please connect your wallet"）。`useWalletClient` 在 reconnecting 态是禁用的（wagmi/src/hooks/useConnectorClient.ts:85-88），所以 `walletClient` 必为空。
7. **MetaMask 扩展异常时窗口变长**：`reconnect()` 顺序遍历 connectors（injected → coinbase → walletConnect），`isAuthorized/connect` 失败就跳到下一个，WalletConnect 初始化要走网络；最终 `status='disconnected'`、connections 清空。从加载到这一步之间，用户看到的都是「已连接」。

## 三、证据

- **本地复现**（在 `Github/fx100-apps@develop` 目录执行，走应用同一条 `cookieToInitialState → hydrate → getAccount` 路径，wagmi core 2.22.1）：

```
status = reconnecting | isConnected = true | isReconnecting = true | address = 0x6bcc…f164
connector keys = [ 'id', 'name', 'type', 'uid' ] | typeof connector.getProvider = undefined
UNHANDLED REJECTION: TypeError: connector.getProvider is not a function
```

  脚本见 §九。
- **Sentry 核对（2026-09-09，aladdindao0x / fx100-apps）**：FX100-APPS-9 事件原始 JSON 的 console 面包屑保留了未改写的栈：`i: Failed to connect to MetaMask\n at Object.connect (chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js:7:84292)`，外层为 `Error: MetaMask extension not found`（`scripts/inpage.js:4`，unhandledrejection）。FX100-APPS-4 栈帧经 sourcemap 直指 `WalletChainResyncGuard.tsx:37:41`。Replay `c4a357e7…` 错误列表见 §一末行。
- **线上包核对**：`https://testnet.fx100.club/_next/static/chunks/3fx20iozw61qn.js` 内 `{isConnected:t,connector:r,chainId:o}=useAccount()… let t=await r.getProvider().catch(()=>null)`，与源码逐句对应，`r` 即 connector。
- **字符串溯源**：`grep -rl "Failed to connect to MetaMask"` 于应用源码、45 个线上 chunk、根与各子包 node_modules（含 @metamask/sdk 0.33.1、@wagmi/connectors 6.2.0、connectkit 1.9.2）均为空。同类报错见 [metamask-extension#35187](https://github.com/MetaMask/metamask-extension/issues/35187)、[extension-provider#1](https://github.com/MetaMask/metamask-extension-provider/issues/1)。
- **版本**：wagmi 2.19.5 · @wagmi/core 2.22.1 · viem 2.49.2 · connectkit 1.9.2；Guard 文件唯一提交 `71647c81`（2026-08-04，"feat: fix possible wallet connect issues"）。

## 四、修改方案

### P0 · Guard 不得在重连窗口内碰 connector 方法（必改）

`src/components/providers/WalletChainResyncGuard.tsx`：

```diff
-  const { isConnected, connector, chainId: wagmiChainId } = useAccount();
+  const { isConnected, isReconnecting, connector, chainId: wagmiChainId } = useAccount();
   const inFlightRef = useRef(false);

   const resyncIfStale = useCallback(async () => {
-    if (!isConnected || !connector || inFlightRef.current) return;
+    // reconnecting 期间 connector 只是 cookie 还原的 { id, name, type, uid } 壳，没有任何方法
+    // （对照 wagmi 自身：useConnectorClient 用 status==='reconnecting' && connector?.getProvider 防）
+    if (!isConnected || isReconnecting || !connector || inFlightRef.current) return;
+    if (typeof connector.getProvider !== 'function') return;
     inFlightRef.current = true;
     try {
-      const provider = (await connector.getProvider().catch(() => null)) as
-        | EIP1193Provider
-        | null;
+      let provider: EIP1193Provider | null = null;
+      try {
+        provider = (await connector.getProvider()) as EIP1193Provider | null;
+      } catch {
+        return;
+      }
       if (!provider?.request) return;
       ...
       await reconnect(config, { connectors: [connector] });
+    } catch (err) {
+      logger.warn('Wallet chain resync failed', { connectorId: connector.id, error: String(err) });
     } finally {
       inFlightRef.current = false;
     }
-  }, [config, connector, isConnected, wagmiChainId]);
+  }, [config, connector, isConnected, isReconnecting, wagmiChainId]);

   useEffect(() => {
-    if (!isConnected) return;
+    if (!isConnected || isReconnecting) return;
     const onVisible = () => {
-      if (document.visibilityState === 'visible') resyncIfStale();
+      if (document.visibilityState === 'visible') void resyncIfStale();
     };
+    const onFocus = () => { void resyncIfStale(); };
     document.addEventListener('visibilitychange', onVisible);
-    window.addEventListener('focus', resyncIfStale);
+    window.addEventListener('focus', onFocus);
     return () => {
       document.removeEventListener('visibilitychange', onVisible);
-      window.removeEventListener('focus', resyncIfStale);
+      window.removeEventListener('focus', onFocus);
     };
-  }, [isConnected, resyncIfStale]);
+  }, [isConnected, isReconnecting, resyncIfStale]);
```

要点：① 早退条件加 `isReconnecting` 与 `typeof getProvider`；② `getProvider` 的同步抛错要能被接住（`.catch` 接不住同步 throw）；③ 监听器不得把未处理的 promise 漏出去。

### P1 · 重连期间不要冒充「已连接」（强烈建议，用户看到的就是这个）

- 下单门控改为 `useAccount().status === 'connected'`（或 `isConnected && !isReconnecting`）**且** `walletClient` 已就绪；涉及 `useOrderFormController.ts:2415` 的文案分支与 `submitButtonModel` 的 `blocked`。
- reconnecting 期间按钮 `disabled`，文案「钱包重连中…」（新增 i18n key，四语种）；重连失败（status 回到 `disconnected`）自然落回「Connect wallet」。
- `useCreateOrder.ts:1085` 的 `wallet_not_connected` 分支：不要先置 `calculating` 再报错，或把文案区分为「钱包重连中，请稍候」/「钱包不可用，请重新连接」——现状是头部显示地址、弹窗却让连钱包。
- 同型入口一并核对：`useCreateDecreaseOrder.ts:646`、`usePositionAdjust.ts:237`、`useUpdateOrder.ts:214`、`useCancelOrder.ts:80` 都是同一句 `!isConnected || !walletClient` 守卫，表现相同。

### P2 · 可选

- `FlashSessionStatusSync.tsx:95` 的 nonce 检查可等 `status === 'connected'` 再发，减少重连期间的无效请求（不影响正确性）。

### 非前端

- MetaMask 扩展侧报错不在应用可控范围。给用户的回执建议：刷新页面重新连接；更新 MetaMask 扩展；停用其他钱包扩展（多注入冲突是该报错最常见成因）；仍失败请附钱包弹窗截图。

## 五、是否只影响 MetaMask（Rabby 等其它钱包）

- **前端两处缺陷与钱包无关。** cookie 里的壳 connector 对任何 connector 都成立（`io.rabby` / `io.metamask` / `coinbaseWalletSDK` / `walletConnect`，wagmi `partialize` 一视同仁），`useAccount()` 的 reconnecting 分支也不看钱包类型。Rabby 用户在重连窗口内切窗口同样触发 TypeError，同样看到假连接。§九 脚本把 `id` 改成 `io.rabby` 结果一样。
- **`Failed to connect to MetaMask` 这句只有 MetaMask 会报**，它来自 MetaMask 扩展注入脚本。Rabby 不会报这句话，但有同类故障面：① 扩展更新/重载后注入脚本与扩展后台断连（MV3 扩展通病）；② Rabby 把 `window.ethereum` 定义成**不可配置的 getter**，并可在「MetaMask 模式」下以 `rdns=io.metamask`、`isMetaMask=true` 冒充 MetaMask（来源：`@rabby-wallet/page-provider` 发布包），与 MetaMask 共存时互相干扰（MetaMask #14737、Rabby #2953）。
- **对本站的影响**：wagmi `injected()` 无 `target`，走 `window.ethereum`，谁是默认钱包就连谁；EIP-6963 条目按 rdns 区分，但 Rabby MetaMask 模式下 rdns 也是 `io.metamask`，ConnectKit 里会显示成 MetaMask。所以工单里「MetaMask」的用户也可能实际装着 Rabby——Sentry 没有扩展清单，无法从事件判断；回执里「停用其它钱包扩展」这条要保留。

## 六、Sentry 侧核对（2026-09-09 已完成）

1. `Failed to connect to MetaMask` 栈帧 = `chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js`（MetaMask 扩展 ID），不在 `/_next/static/chunks/…`。**确认钱包侧。**
2. Replay 错误按时间：TypeError 4 次分散在 01:52～05:29，紧随 05:29 的是 05:30 两次 MetaMask 失败；另有 40 余次 FX100-APPS-6（见 §一）。
3. Replay 里 4 条 `/api/relay/nonce` **全部带 `&subaccount=`**（00:07 / 00:35 / 05:43 / 08:46），即全部来自 `FlashSessionStatusSync` 的被动同步，没有一条来自 `resolveSubaccountApproval.ts:79`。**用户从未过钱包守卫进入 `submitOrder`。**

## 七、验收标准（QA 按此复测，六字段）

| # | 前置条件 | 测试数据 | 操作步骤 | 核对数据 | 期望结果 |
|---|---|---|---|---|---|
| 1 | MetaMask 已连接过 testnet、cookie `wagmi.store` 存在 | 任意已连接账号 | 刷新 `/trade?market=BTCUSDC`，2 秒内在标签页之间来回切换 3 次 | 控制台 | 无 `Uncaught (in promise) TypeError: … getProvider`；推导：P0 早退条件在 reconnecting 态直接 return |
| 2 | 同上 | 同上 | 在 Chrome 扩展页停用 MetaMask 后刷新 `/trade` | 头部钱包区、下单按钮 | 重连期间按钮 disabled 且文案为「钱包重连中…」；重连失败后头部为未连接、按钮为「Connect wallet」；**不出现** Calculating → Please connect your wallet 弹窗 |
| 3 | 修复版本已带 Sentry release 标记 | — | 发布后观察 48 小时 | Sentry issue 计数 | 该 TypeError 在新 release 上为 0 |
| 4 | （建议）单测 | wagmi config 置于 `reconnecting` + 壳 connector | mount Guard，`dispatchEvent(new Event('focus'))` | `unhandledrejection` | 0 次 |

实际结果：待回填。

## 八、给用户的回执要点（英文，待修复方案确认后发）

- The error came from the MetaMask extension losing its connection to the page, so the order never reached our relay (no on-chain transaction, nothing was charged).
- Please try: reload the page and reconnect; update the MetaMask extension; disable other wallet extensions temporarily (multiple injected wallets is the most common cause).
- We are also fixing the trade page so it no longer shows "connected" while the wallet is still reconnecting.

## 九、附录：20 行复现脚本

在 `Github/fx100-apps@develop` 目录执行（用仓库已安装的 wagmi，不需要浏览器）：

```bash
node --input-type=module -e "
import { createConfig, http, hydrate, getAccount, createStorage, cookieToInitialState } from '@wagmi/core';
import { baseSepolia } from '@wagmi/core/chains';
process.on('unhandledRejection', e => console.log('UNHANDLED:', e.name + ': ' + e.message));
const mem = new Map();
const storage = createStorage({ storage: { getItem: k => mem.get(k) ?? null, setItem: (k,v) => mem.set(k,v), removeItem: k => mem.delete(k) } });
const config = createConfig({ chains: [baseSepolia], transports: { [baseSepolia.id]: http('http://127.0.0.1:1') }, connectors: [], storage, ssr: true });
const uid = 'abc123';
const cookie = 'wagmi.store=' + JSON.stringify({ state: { connections: { __type: 'Map', value: [[uid, { accounts: ['0x000000000000000000000000000000000000dEaD'], chainId: 84532, connector: { id: 'io.metamask', name: 'MetaMask', type: 'injected', uid } }]] }, chainId: 84532, current: uid }, version: 2 });
hydrate(config, { initialState: cookieToInitialState(config, cookie), reconnectOnMount: true });
const a = getAccount(config);
console.log('status =', a.status, '| isConnected =', a.isConnected, '| typeof getProvider =', typeof a.connector.getProvider);
(async () => { if (a.isConnected && a.connector) await a.connector.getProvider().catch(() => null); })();
await new Promise(r => setTimeout(r, 50));
"
```

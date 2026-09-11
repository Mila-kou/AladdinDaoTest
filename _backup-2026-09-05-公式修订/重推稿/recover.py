import json, os, glob, io, sys
base='/Users/milakou/.claude/projects/-Users-milakou-Documents-FX100/7d295c95-2c3e-4fee-a63f-707b9b23b26f/subagents/workflows'
wfs=['wf_c03ad5c8-aec','wf_381fd010-804','wf_9844efda-3be','wf_36b3d57e-d2b','wf_b27a8149-99b']
R=os.path.dirname(os.path.abspath(__file__))
ops=[]
def walk(o,acc):
    if isinstance(o,dict):
        if o.get('type')=='tool_use' and o.get('name') in ('Write','Edit'):
            fp=(o.get('input') or {}).get('file_path','')
            if 'scratchpad/rewrite/' in fp: acc.append((o['name'],os.path.basename(fp),o['input']))
        for v in o.values(): walk(v,acc)
    elif isinstance(o,list):
        for v in o: walk(v,acc)
for wf in wfs:
    for f in sorted(glob.glob(f'{base}/{wf}/agent-*.jsonl'),key=os.path.getmtime):
        for line in io.open(f,encoding='utf-8',errors='replace'):
            try: rec=json.loads(line)
            except Exception: continue
            acc=[]; walk(rec,acc); ops.extend(acc)
files={}; failed=[]
for name,fn,inp in ops:
    if name=='Write': files[fn]=inp.get('content','')
    else:
        cur=files.get(fn)
        if cur is None: failed.append((fn,'Edit before any Write')); continue
        old,new=inp.get('old_string',''),inp.get('new_string','')
        if old not in cur: failed.append((fn,f'old_string 未命中 ({len(old)} 字符): {old[:60]!r}')); continue
        files[fn]=cur.replace(old,new) if inp.get('replace_all') else cur.replace(old,new,1)
print(f'回放 {len(ops)} 次操作，产出 {len(files)} 个文件，未命中 Edit {len(failed)} 次')
for fn,why in failed: print('   ✗',fn,why)

# ---- 补回我手工改的两处 ----
def rep(fn,old,new,tag):
    s=files[fn]
    if s.count(old)!=1: print(f'   ✗ 手工补丁 {tag}: 命中 {s.count(old)} 次'); return
    files[fn]=s.replace(old,new); print(f'   ✓ 手工补丁 {tag}')
rep('u11.md','`DecreasePositionUtils.sol::decreasePosition` 内一共有**六处订单自动改写**，全部发事件；**必须按源码顺序断言**（用例若按错顺序构造，会看到与预期不同的那一条先触发）：',
'`DecreasePositionUtils.sol::decreasePosition` 内一共有**七处订单自动改写**，其中前六处发事件、**第 7 处不发任何事件**；**必须按源码顺序断言**（用例若按错顺序构造，会看到与预期不同的那一条先触发）：','u11 六→七')
a6='6. 剩余 `sizeInUsd - sizeDeltaUsd < MIN_POSITION_SIZE_USD` → 同样改写为 `maxSizeDelta`（全平，`OrderSizeDeltaAutoUpdated`）。'
rep('u11.md',a6,a6+'''

以下一条在部分减仓分支块**之后**、`processCollateral` **之前**执行，全平路径必经：

7. **全平时把 `initialCollateralDeltaAmount` 强制置 0**（`DecreasePositionUtils.sol:238-241`，源码注释「set the initial collateral delta amount to zero to help ensure that the order can be executed」）：条件为 `sizeDeltaUsd == position.sizeInUsd() && order.initialCollateralDeltaAmount() > 0`。

   ⚠️ **这一处不发任何事件**，且它是全平路径上对订单的最后一次写入——包括被第 2/5/6 条升级为全平的订单。后果有两条，都会让断言写错：
   - 事件与 Reader 里读到的 `initialCollateralDeltaAmount` 在全平场景**恒为 0**，**不能**用它表示"本次提取的保证金"；真正还给用户的是 `output.outputAmount`（含 `remainingCollateralAmount` 全额）。按"requestedCollateralWithdrawal"建模会整整少算一份本金。
   - 因为不发事件，**无法靠事件流发现这次改写**；只能靠"订单创建时的 `initialCollateralDeltaAmount` 与执行后读到的值不一致"来反推。用例若断言"全平时该字段等于创建时的值"会必然 FAIL，而那不是缺陷。''','u11 第7条')
rep('u13.md','`d` 本身是价格的函数，所以“成交价 → index 价”不是一次除法，是不动点。逐项拆开（源码亲验，`PositionPricingUtils.sol::getDynamicSpread` / `::getSkewImpact` / `::getSkewRef` / `::getPriceImpactSpread` / `::isBalanceWasImproved`）：',
'**整仓清算判定下 `d` 与 index 价无关**，所以“成交价 → index 价”是一次除法，不需要不动点。逐项拆开（源码亲验，`PositionPricingUtils.sol::getDynamicSpread` / `::getSkewImpact` / `::getSkewRef` / `::getPriceImpactSpread` / `::isBalanceWasImproved`）：','u13 不动点')
rep('u13.md',r'| `priceImpactSpread` | **是** | `orderSize = \|usdDelta\| = Q × midPrice` 是绝对 USD，除以 USD 口径的 `depth` 配置，比值随价格单调变化 |',
'| `priceImpactSpread` | **否** | `getPriceImpactSpread` 用的是 `params.usdDelta.abs()`，而**它在 L164 被调用，早于 L166 的 `getNextOpenInterest`**（后者才在 L303 把 `usdDelta` 改写成 `tokenDelta × midPrice`）。清算路径传进来的是 `PositionUtils.sol:711` 的 `-cache.sizeDeltaUsd`——全平时即仓位存储的 `sizeInUsd`，是**已入账的 USD 常量，与当前 index 价无关** |','u13 impact行')
rep('u13.md','也就是说，整仓清算判定里 `d` 只通过 `priceImpactSpread` 一项依赖价格；`priceImpactParameter` 或 `depth` 任一为 0 时该项直接返回 0（`getPriceImpactSpread` 的 guard），此时 `d` 完全与价格无关，闭式反解出的成交价可以一次换算回 index 价：`indexMin = ceil(P_safe × 1e18 / (1e18 − d))`（Long）、`indexMax = floor(P_safe × 1e18 / (1e18 + d))`（Short）。',
'''也就是说，**整仓清算判定里 `d` 的三个分量全部尺度不变**，闭式反解出的成交价可以一次换算回 index 价：

```text
Long   indexMin = ceil (P_safe × 1e18 / (1e18 − d))
Short  indexMax = floor(P_safe × 1e18 / (1e18 + d))
```

> 这与**开仓/部分减仓**路径不同：那两条路径传给 `getDynamicSpread` 的 `usdDelta` 来自订单的 `sizeDeltaUsd`，token 计价下它由 `tokenDelta × 价格` 派生，才会随价格变。本节结论只覆盖**全平清算判定**。

**订正记录（2026-09-05）**：初稿把 `priceImpactSpread` 判为“随 index 价变”、并据此要求走不动点迭代——依据是 `orderSize = |usdDelta| = Q × midPrice`。该推导把 `getNextOpenInterest` 对 `usdDelta` 的改写（L303）当成了发生在 `getPriceImpactSpread`（L164）之前，与源码次序相反。已按实际调用次序订正。''','u13 结论段')
rep('u13.md','| 合成订单的 `orderType` | 不设置（默认 `MarketSwap`=0，非清算单）→ `allowNegativeSpread = true` |',
'| 合成订单的 `orderType` | 不设置（枚举零值，即 `Order.OrderType.MarketIncrease`；`OrderType` 中**没有** `MarketSwap` 成员）→ 非清算单 → `allowNegativeSpread = true` |','u13 枚举名')
rep('u13.md','''    C  = 5.5e8 × 9.99e23 = 5.4945e32
    positionFeeAmount = ⌊6e30 / 9.99e23⌋ = 6,006,006     totalCostAmount = 7,006,006
    F  = 7,006,006 × 9.99e23 = 6.998999994e30
    N⁺ = 1e34 + 5e31 + 6.999e30 − 5.4945e32 ≈ 9.507549e33 → 95,075.49（比 $1 假设高 5.49 USD/BTC）''',
'''    C  = 5.5e8 × 9.99e23 = 5.4945e32
    positionFeeAmount      = ⌊6e30 / 9.99e23⌋ = 6,006,006
    negativeFundingFeeAmount = ⌈1e30 / 9.99e23⌉ = 1,001,002    ← 与费用同样按脱锚价折算，不能沿用 $1 下的 1,000,000
    totalCostAmount = 6,006,006 + 1,001,002   = 7,007,008
    F  = 7,007,008 × 9.99e23 = 7.000000992e30
    N⁺ = 1e34 + 5e31 + 7.000000992e30 − 5.4945e32 = 9.507550000992e33 → 95,075.50（比 $1 假设高 5.50 USD/BTC）''','u13 脱锚变体')
rep('u13.md','''Long  分母 = Q + A × scale     P_safe = ceil ( (S + T* + F − Fp) / 分母 )
Short 分母 = Q − A × scale     P_safe = floor( (S − T* − F + Fp) / 分母 )''',
'''Long  分母 = Q + A × scale     P_safe = ceil ( (S + T* + F − Fp) / 分母 )      ← 分母恒 > 0
Short 分母 = Q − A × scale     P_safe = floor( (S − T* − F + Fp) / 分母 )      ← 分母可能 ≤ 0，见下''','u13 同币种分母')
rep('u13.md','`F` 与 `Fp` 仍留在分子：',
'''⚠️ **空头同币种的分母可能为负或零**（抵押数量折算后超过仓位 token 数，即 `A × scale ≥ Q`）。分母为负时不等式两边同除会**翻转方向**，`floor` 必须改成 `ceil`；分母为零时价格再高也不会触发该条件（该仓在这个维度上不可清算，需由条件 ① / ② 兜底）。写空头同币种用例前先判分母符号，不要直接套上式。

`F` 与 `Fp` 仍留在分子：''','u13 空头分母')

for fn,c in files.items(): io.open(f'{R}/{fn}','w',encoding='utf-8').write(c)
# ---- 校验和：每节行数 vs 上次空跑 ----
exp={1:140,2:222,3:314,4:321,5:399,6:157,7:399,8:130,9:221,10:306,11:315,12:252,13:279,14:263,15:208,16:370,17:419,18:294,19:152,20:159,21:92,22:93,23:64}
import re
got={}
for fn,c in files.items():
    if '-gap' in fn: continue
    lines=c.split('\n'); idx=[i for i,l in enumerate(lines) if l.startswith('## ')]
    for k,i in enumerate(idx):
        j=idx[k+1] if k+1<len(idx) else len(lines)
        m=re.match(r'## (\d+)\.',lines[i])
        if m: got[int(m.group(1))]=j-i
bad=[(n,exp[n],got.get(n)) for n in exp if got.get(n)!=exp[n]]
print('\n校验和（节：期望行数 / 回放行数）')
print('   全部一致 ✓' if not bad else '   ✗ 不一致：'+', '.join(f'§{n}:{e}/{g}' for n,e,g in bad))
print('缺节:',[n for n in exp if n not in got])

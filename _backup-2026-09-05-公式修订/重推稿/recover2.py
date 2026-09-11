import json, os, glob, io, re
base='/Users/milakou/.claude/projects/-Users-milakou-Documents-FX100/7d295c95-2c3e-4fee-a63f-707b9b23b26f/subagents/workflows'
wfs=['wf_c03ad5c8-aec','wf_381fd010-804','wf_9844efda-3be','wf_36b3d57e-d2b','wf_b27a8149-99b']
R=os.path.dirname(os.path.abspath(__file__))
# ---------- 扫描 ----------
ops=[]; reads={}; snaps={}; edits_by=[]; bash=[]
def walk(o,acc):
    if isinstance(o,dict):
        t=o.get('type'); n=o.get('name'); inp=o.get('input') or {}
        if t=='tool_use' and n in ('Write','Edit') and 'scratchpad/rewrite/' in inp.get('file_path',''):
            acc.append(('op',n,os.path.basename(inp['file_path']),inp))
        elif t=='tool_use' and n=='Read':
            m=re.search(r'rewrite/(u\d\d(?:-gap)?\.md)$',inp.get('file_path',''))
            if m and not inp.get('offset') and not inp.get('limit'): acc.append(('read',o.get('id'),m.group(1)))
        elif t=='tool_use' and n=='Bash' and 'rewrite/' in inp.get('command',''):
            acc.append(('bash',inp.get('command','')))
        elif t=='tool_result':
            c=o.get('content')
            if isinstance(c,list): c='\n'.join(b.get('text','') for b in c if isinstance(b,dict))
            acc.append(('res',o.get('tool_use_id'),str(c)))
        for v in o.values(): walk(v,acc)
    elif isinstance(o,list):
        for v in o: walk(v,acc)
for wf in wfs:
    for f in sorted(glob.glob(f'{base}/{wf}/agent-*.jsonl'),key=os.path.getmtime):
        for line in io.open(f,encoding='utf-8',errors='replace'):
            try: rec=json.loads(line)
            except Exception: continue
            ts=rec.get('timestamp','')
            acc=[]; walk(rec,acc)
            for a in acc:
                if a[0]=='op': ops.append((wf,)+a[1:])
                elif a[0]=='read': reads[a[1]]=(ts,a[2])
                elif a[0]=='bash': bash.append((ts,wf,a[1]))
                elif a[0]=='res' and a[1] in reads:
                    ts0,fn=reads[a[1]]; snaps.setdefault(fn,[]).append((ts0,a[2]))
# ---------- 回放 ----------
replay={}
for wf,name,fn,inp in ops:
    if name=='Write': replay[fn]=inp.get('content','')
    elif fn in replay:
        old,new=inp.get('old_string',''),inp.get('new_string','')
        if old in replay[fn]: replay[fn]=replay[fn].replace(old,new) if inp.get('replace_all') else replay[fn].replace(old,new,1)
def rep(d,fn,old,new):
    if new in d[fn]: return 'already'
    if d[fn].count(old)!=1: return f'miss({d[fn].count(old)})'
    d[fn]=d[fn].replace(old,new); return 'ok'
# u11 手工补丁
print('u11 补丁:',rep(replay,'u11.md','`DecreasePositionUtils.sol::decreasePosition` 内一共有**六处订单自动改写**，全部发事件；**必须按源码顺序断言**（用例若按错顺序构造，会看到与预期不同的那一条先触发）：','`DecreasePositionUtils.sol::decreasePosition` 内一共有**七处订单自动改写**，其中前六处发事件、**第 7 处不发任何事件**；**必须按源码顺序断言**（用例若按错顺序构造，会看到与预期不同的那一条先触发）：'))
a6='6. 剩余 `sizeInUsd - sizeDeltaUsd < MIN_POSITION_SIZE_USD` → 同样改写为 `maxSizeDelta`（全平，`OrderSizeDeltaAutoUpdated`）。'
seven='''

以下一条在部分减仓分支块**之后**、`processCollateral` **之前**执行，全平路径必经：

7. **全平时把 `initialCollateralDeltaAmount` 强制置 0**（`DecreasePositionUtils.sol:238-241`，源码注释「set the initial collateral delta amount to zero to help ensure that the order can be executed」）：条件为 `sizeDeltaUsd == position.sizeInUsd() && order.initialCollateralDeltaAmount() > 0`。

   ⚠️ **这一处不发任何事件**，且它是全平路径上对订单的最后一次写入——包括被第 2/5/6 条升级为全平的订单。后果有两条，都会让断言写错：
   - 事件与 Reader 里读到的 `initialCollateralDeltaAmount` 在全平场景**恒为 0**，**不能**用它表示"本次提取的保证金"；真正还给用户的是 `output.outputAmount`（含 `remainingCollateralAmount` 全额）。按"requestedCollateralWithdrawal"建模会整整少算一份本金。
   - 因为不发事件，**无法靠事件流发现这次改写**；只能靠"订单创建时的 `initialCollateralDeltaAmount` 与执行后读到的值不一致"来反推。用例若断言"全平时该字段等于创建时的值"会必然 FAIL，而那不是缺陷。'''
print('u11 第7条:',rep(replay,'u11.md',a6,a6+seven))
# u13 手工补丁（6 条精确 + 1 条容错）
P13=[(r'| `priceImpactSpread` | **是** | `orderSize = \|usdDelta\| = Q × midPrice` 是绝对 USD，除以 USD 口径的 `depth` 配置，比值随价格单调变化 |',
 '| `priceImpactSpread` | **否** | `getPriceImpactSpread` 用的是 `params.usdDelta.abs()`，而**它在 L164 被调用，早于 L166 的 `getNextOpenInterest`**（后者才在 L303 把 `usdDelta` 改写成 `tokenDelta × midPrice`）。清算路径传进来的是 `PositionUtils.sol:711` 的 `-cache.sizeDeltaUsd`——全平时即仓位存储的 `sizeInUsd`，是**已入账的 USD 常量，与当前 index 价无关** |'),
('也就是说，整仓清算判定里 `d` 只通过 `priceImpactSpread` 一项依赖价格；`priceImpactParameter` 或 `depth` 任一为 0 时该项直接返回 0（`getPriceImpactSpread` 的 guard），此时 `d` 完全与价格无关，闭式反解出的成交价可以一次换算回 index 价：`indexMin = ceil(P_safe × 1e18 / (1e18 − d))`（Long）、`indexMax = floor(P_safe × 1e18 / (1e18 + d))`（Short）。',
'''也就是说，**整仓清算判定里 `d` 的三个分量全部尺度不变**，闭式反解出的成交价可以一次换算回 index 价：

```text
Long   indexMin = ceil (P_safe × 1e18 / (1e18 − d))
Short  indexMax = floor(P_safe × 1e18 / (1e18 + d))
```

> 这与**开仓/部分减仓**路径不同：那两条路径传给 `getDynamicSpread` 的 `usdDelta` 来自订单的 `sizeDeltaUsd`，token 计价下它由 `tokenDelta × 价格` 派生，才会随价格变。本节结论只覆盖**全平清算判定**。

**订正记录（2026-09-05）**：初稿把 `priceImpactSpread` 判为“随 index 价变”、并据此要求走不动点迭代——依据是 `orderSize = |usdDelta| = Q × midPrice`。该推导把 `getNextOpenInterest` 对 `usdDelta` 的改写（L303）当成了发生在 `getPriceImpactSpread`（L164）之前，与源码次序相反。已按实际调用次序订正。'''),
('| 合成订单的 `orderType` | 不设置（默认 `MarketSwap`=0，非清算单）→ `allowNegativeSpread = true` |','| 合成订单的 `orderType` | 不设置（枚举零值，即 `Order.OrderType.MarketIncrease`；`OrderType` 中**没有** `MarketSwap` 成员）→ 非清算单 → `allowNegativeSpread = true` |'),
('''    C  = 5.5e8 × 9.99e23 = 5.4945e32
    positionFeeAmount = ⌊6e30 / 9.99e23⌋ = 6,006,006     totalCostAmount = 7,006,006
    F  = 7,006,006 × 9.99e23 = 6.998999994e30
    N⁺ = 1e34 + 5e31 + 6.999e30 − 5.4945e32 ≈ 9.507549e33 → 95,075.49（比 $1 假设高 5.49 USD/BTC）''',
'''    C  = 5.5e8 × 9.99e23 = 5.4945e32
    positionFeeAmount      = ⌊6e30 / 9.99e23⌋ = 6,006,006
    negativeFundingFeeAmount = ⌈1e30 / 9.99e23⌉ = 1,001,002    ← 与费用同样按脱锚价折算，不能沿用 $1 下的 1,000,000
    totalCostAmount = 6,006,006 + 1,001,002   = 7,007,008
    F  = 7,007,008 × 9.99e23 = 7.000000992e30
    N⁺ = 1e34 + 5e31 + 7.000000992e30 − 5.4945e32 = 9.507550000992e33 → 95,075.50（比 $1 假设高 5.50 USD/BTC）'''),
('''Long  分母 = Q + A × scale     P_safe = ceil ( (S + T* + F − Fp) / 分母 )
Short 分母 = Q − A × scale     P_safe = floor( (S − T* − F + Fp) / 分母 )''',
'''Long  分母 = Q + A × scale     P_safe = ceil ( (S + T* + F − Fp) / 分母 )      ← 分母恒 > 0
Short 分母 = Q − A × scale     P_safe = floor( (S − T* − F + Fp) / 分母 )      ← 分母可能 ≤ 0，见下'''),
('`F` 与 `Fp` 仍留在分子：','''⚠️ **空头同币种的分母可能为负或零**（抵押数量折算后超过仓位 token 数，即 `A × scale ≥ Q`）。分母为负时不等式两边同除会**翻转方向**，`floor` 必须改成 `ceil`；分母为零时价格再高也不会触发该条件（该仓在这个维度上不可清算，需由条件 ① / ② 兜底）。写空头同币种用例前先判分母符号，不要直接套上式。

`F` 与 `Fp` 仍留在分子：''')]
for i,(o,n) in enumerate(P13,1): print(f'u13 补丁{i}:',rep(replay,'u13.md',o,n))
# 容错的「不动点」补丁：不区分引号风格
pat=re.compile(r'`d` 本身是价格的函数，所以.成交价 → index 价.不是一次除法，是不动点。逐项拆开')
new_head='**整仓清算判定下 `d` 与 index 价无关**，所以“成交价 → index 价”是一次除法，不需要不动点。逐项拆开'
if '不需要不动点' in replay['u13.md']: print('u13 不动点: already')
else:
    s,k=pat.subn(new_head,replay['u13.md']); replay['u13.md']=s; print('u13 不动点:', 'ok' if k==1 else f'miss({k})')
# ---------- 快照 ----------
def strip(text):
    out=[];nums=[]
    for l in text.split('\n'):
        m=re.match(r'^\s*(\d+)\t(.*)$',l)
        if m: nums.append(int(m.group(1))); out.append(m.group(2))
    return (bool(nums) and nums==list(range(1,len(nums)+1))), '\n'.join(out)+'\n'
snapdict={}
for fn,lst in snaps.items():
    for ts,txt in sorted(lst,reverse=True):
        ok,c=strip(txt)
        if ok: snapdict.setdefault(fn,[]).append((ts,c))
# ---------- 期望 ----------
exp={1:140,2:222,3:314,4:321,5:399,6:157,7:399,8:130,9:221,10:306,11:315,12:252,13:279,14:263,15:208,16:370,17:419,18:294,19:152,20:159,21:92,22:93,23:64}
def secs(c):
    lines=c.split('\n'); idx=[i for i,l in enumerate(lines) if l.startswith('## ')]; d={}
    for k,i in enumerate(idx):
        j=idx[k+1] if k+1<len(idx) else len(lines)
        m=re.match(r'## (\d+)\.',lines[i])
        if m: d[int(m.group(1))]=j-i
    return d
def good(c): 
    s=secs(c); return bool(s) and all(exp.get(n)==v for n,v in s.items())
final={}; src={}
for u in [f'u{i:02d}.md' for i in range(1,14)]:
    cands=[(f'snap@{ts[11:19]}',c) for ts,c in snapdict.get(u,[])]+[('replay',replay.get(u,''))]
    pick=next(((lab,c) for lab,c in cands if good(c)),None)
    if pick: final[u],src[u]=pick[1],pick[0]
    else: final[u],src[u]=(snapdict.get(u,[('',replay.get(u,''))])[0][1]),'UNRESOLVED'
# u05：最新快照 + 第三轮 Edit
if src.get('u05.md')=='UNRESOLVED':
    c=snapdict['u05.md'][0][1]
    for wf,name,fn,inp in ops:
        if wf=='wf_36b3d57e-d2b' and name=='Edit' and fn=='u05.md' and inp['old_string'] in c:
            c=c.replace(inp['old_string'],inp['new_string'],1)
    final['u05.md']=c; src['u05.md']='snap+36b3Edit' if good(c) else 'UNRESOLVED'
# ---------- gap 文件：回放 + cat>> 追加 + u02-gap 尝试 ----------
for g in [f'u{i:02d}-gap.md' for i in range(1,14)]: final[g]=replay.get(g,''); src[g]='replay'
for ts,wf,cmd in sorted(bash):
    m=re.match(r'\s*cat >> "?[^"\n]*rewrite/(u\d\d-gap\.md)"? <<\s*\'?(\w+)\'?\n(.*)',cmd,re.S)
    if m:
        g,tok,body=m.group(1),m.group(2),m.group(3)
        end=body.find('\n'+tok); body=body[:end+1] if end>=0 else body
        if body.strip() and body.strip() not in final[g]: final[g]+= ('' if final[g].endswith('\n') else '\n')+body; src[g]+='+append'
for wf,name,fn,inp in ops:
    if fn=='u02-gap.md' and name=='Edit' and inp['old_string'] not in final[fn] and inp['new_string'] not in final[fn]:
        final[fn]+='\n\n<!-- 恢复时未能定位原位置，改为追加 -->\n'+inp['new_string']+'\n'; src[fn]+='+E追加'
# ---------- 写出 + 报告 ----------
for fn,c in final.items(): io.open(f'{R}/{fn}','w',encoding='utf-8').write(c)
print('\n文件          来源              章节行数')
bad=0
for u in sorted(final):
    if '-gap' in u: continue
    s=secs(final[u]); ok=good(final[u]); bad+= (not ok)
    print(f"{u:10s} {src[u]:16s} {'✓' if ok else '✗'} "+' '.join(f'§{n}:{v}' for n,v in sorted(s.items())))
print('gap 行数:',' '.join(f"{g[:3]}:{len(final[g].splitlines())}{'+' if '+' in src[g] else ''}" for g in sorted(final) if '-gap' in g))
print('\n结果:', '全部 23 节校验和一致 ✓' if bad==0 else f'{bad} 个文件未通过')

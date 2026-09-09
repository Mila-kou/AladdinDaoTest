#!/usr/bin/env python3
"""把已通过复核的重推稿按章节拼回主文档。默认 dry-run，--apply 落盘。"""
import io, os, re, sys
DOC = '/Users/milakou/Documents/FX100/TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-核心字段计算公式.md'
D   = os.path.dirname(os.path.abspath(__file__))
def split_sections(text):
    lines = text.split('\n'); idx = [i for i,l in enumerate(lines) if l.startswith('## ')]
    if not idx: return text, []
    pre = '\n'.join(lines[:idx[0]]); secs = []
    for n,i in enumerate(idx):
        j = idx[n+1] if n+1 < len(idx) else len(lines)
        secs.append((lines[i][3:].strip(), '\n'.join(lines[i:j])))
    return pre, secs
def num(t):
    m = re.match(r'(\d+)\.', t); return int(m.group(1)) if m else None
def main(keys, apply=False):
    text = io.open(DOC, encoding='utf-8').read(); pre, msecs = split_sections(text); rep = {}
    for k in keys:
        p = f'{D}/{k}.md'
        if not os.path.exists(p): print(f'  ⚠️ {k}.md 不存在'); continue
        for t, body in split_sections(io.open(p, encoding='utf-8').read())[1]:
            n = num(t)
            if n is None: print(f'  ⚠️ {k}: 无编号标题「{t}」'); continue
            if n in rep: print(f'  ❌ §{n} 冲突：{rep[n][0]} vs {k}'); return 1
            rep[n] = (k, t, body)
    out=[pre]; ch=[]; kp=[]
    for t, body in msecs:
        n = num(t)
        if n in rep:
            k, nt, nb = rep.pop(n)
            if nt != t: print(f'  ⚠️ §{n} 标题变化「{t}」→「{nt}」')
            out.append(nb); ch.append((n,t,k,len(body.split('\n')),len(nb.split('\n'))))
        else: out.append(body); kp.append(n)
    if rep: print('  ❌ 找不到位置：', {n:v[0] for n,v in rep.items()}); return 1
    print(f'\n  替换 {len(ch)} 节：')
    for n,t,k,a,b in ch: print(f'    §{n:2d} {t[:34]:36s} {k}  {a:4d} → {b:4d} 行 ({b-a:+d})')
    print(f'\n  保留 {len(kp)} 节：{", ".join("§"+str(n) for n in kp)}')
    new = '\n'.join(out)
    if not new.endswith('\n'): new += '\n'
    print(f'\n  全文：{len(text.split(chr(10)))} → {len(new.split(chr(10)))} 行')
    if apply: io.open(DOC,'w',encoding='utf-8').write(new); print('\n  ✅ 已写入主文档')
    else: print('\n  （dry-run，未写入）')
    return 0
if __name__ == '__main__':
    a=[x for x in sys.argv[1:] if not x.startswith('--')]; sys.exit(main(a, '--apply' in sys.argv))

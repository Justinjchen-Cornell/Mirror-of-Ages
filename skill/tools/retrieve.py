#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通鉴抉择·古籍库检索工具
用法:
  python retrieve.py 关键词 [关键词2 ...]        # 两库全文检索(默认各库最多12条)
  python retrieve.py 关键词 --src zztj          # 只查资治通鉴
  python retrieve.py 关键词 --vol 65            # 限定通鉴卷次
  python retrieve.py --kernel 功高主疑           # 场景内核检索(扩展词表)
  python retrieve.py --case wangjian             # 查看案例卡元数据
  python retrieve.py --list-kernels              # 列出全部场景内核
输出: 命中行 + 卷/篇归属 + 上下文; --json 输出机器可读结果。
"""
import argparse, json, re, sys, os
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
def load(name, jsonf=False):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        sys.stderr.write(
            f"❌ 缺少数据文件: {name}
"
            "   zztj.txt / shiji.txt 全文因版权与体积未随仓库分发，
"
            "   请阅读 skill/data/README.md 获取并放置全文后重试。
")
        sys.exit(1)
    with open(path, encoding='utf-8') as f:
        return json.load(f) if jsonf else f.readlines()
def volof(line, idx):
    for v in idx:
        if v['line_start'] <= line <= v['line_end']:
            return v
    return None
def chapof(line, idx):
    for c in idx:
        if c['line_start'] <= line <= c['line_end']:
            return c
    return None
def search(lines, idx, srcname, terms, limit=12, vol=None, win=70):
    hits, seen = [], set()
    pat = re.compile('|'.join(re.escape(t) for t in terms))
    for i, ln in enumerate(lines, 1):
        if pat.search(ln):
            meta = volof(i, idx) if srcname == '资治通鉴' else chapof(i, idx)
            loc = f"卷{meta['vol']}·{meta['era']}" if srcname == '资治通鉴' and meta else (meta['title'] if meta else '?')
            if vol and (not meta or (srcname == '资治通鉴' and meta['vol'] != vol)):
                continue
            key = (loc, re.sub(r'[\s　]', '', ln)[:60])
            if key in seen:  # dedupe 原文/白话重复行
                continue
            seen.add(key)
            m = pat.search(ln)
            s = max(0, m.start()-win); e = min(len(ln), m.end()+win)
            hits.append({'src': srcname, 'line': i, 'loc': loc, 'text': ln[s:e].strip()})
            if len(hits) >= limit:
                break
    return hits
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('terms', nargs='*', help='检索关键词(多个为任一命中)')
    ap.add_argument('--src', choices=['zztj','shiji','both'], default='both')
    ap.add_argument('--vol', type=int, help='限定资治通鉴卷次')
    ap.add_argument('--limit', type=int, default=12)
    ap.add_argument('--kernel', help='场景内核检索')
    ap.add_argument('--case', help='查看案例元数据')
    ap.add_argument('--list-kernels', action='store_true')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    kernels = load('kernels.json', True)['kernels']
    if a.list_kernels:
        for k, v in kernels.items():
            print(f"- {k}: {v['desc']} (案例: {', '.join(v['cases'])})")
        return
    if a.case:
        idx = load('_index.json', True) if os.path.exists(os.path.join(DATA, '_index.json')) else None
        case = None
        try:
            with open(os.path.join(DATA, '..', 'cases', '_index.json'), encoding='utf-8') as f:
                idx = json.load(f)
            for c in idx['cases']:
                if c['id'] == a.case: case = c
        except FileNotFoundError:
            pass
        print(json.dumps(case, ensure_ascii=False, indent=1) if case else f"未找到案例 {a.case}")
        return
    terms = list(a.terms)
    if a.kernel:
        if a.kernel not in kernels:
            print(f"未知内核。可用: {', '.join(kernels)}"); return
        k = kernels[a.kernel]
        terms += k['terms']
        print(f"# 内核「{a.kernel}」({k['desc']})  检索词: {', '.join(terms)}")
        print(f"# 相关精选案例: {', '.join(k['cases'])}")
    if not terms:
        print("请提供关键词或 --kernel"); return
    out = []
    if a.src in ('zztj','both'):
        out += search(load('zztj.txt'), load('zztj_index.json', True)['volumes'], '资治通鉴', terms, a.limit, a.vol)
    if a.src in ('shiji','both') and not a.vol:
        out += search(load('shiji.txt'), load('shiji_index.json', True)['chapters'], '史记', terms, a.limit)
    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=1)); return
    cur = None
    for h in out:
        tag = f"[{h['src']}] {h['loc']}"
        if tag != cur:
            print(f"\n== {tag} =="); cur = tag
        print(f"L{h['line']}: ...{h['text']}...")
    if not out:
        print("(无命中) 尝试更换关键词, 或用 --kernel 查看内核词表")
if __name__ == '__main__':
    main()

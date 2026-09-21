#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 skill/cases/*.md + skill/data/*.json 转成站点数据 docs/assets/data.js
用法: python tools/build_site_data.py
"""
import json, os, re, sys, statistics
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(ROOT, 'skill')
OUT = os.path.join(ROOT, 'docs', 'assets')
os.makedirs(OUT, exist_ok=True)

idx = json.load(open(os.path.join(SKILL, 'cases', '_index.json'), encoding='utf-8'))['cases']
kernels = json.load(open(os.path.join(SKILL, 'data', 'kernels.json'), encoding='utf-8'))['kernels']

def norm(s):
    return re.sub(r'[\s：:，,。·—\-（）()「」“”""\'"]', '', s)

idx_by_title = {norm(c['title']): c for c in idx}
DETAIL_OVERRIDES = {
    '伍子胥复仇的复利与代价': 'wuzixu',
    '檀道济你的存在本身就是罪': 'tandaoji',
    '萧何从自污到入狱再到一座劣质的庄园': 'xiaohe',
    '马援诫兄侄榜样的选择与身后的风暴': 'mayuan',
}

themes, cases_out, unmatched = [], [], []
field_re = re.compile(r'^- \*\*(.+?)\*\*[：:](.*)$')

for fn in sorted(os.listdir(os.path.join(SKILL, 'cases'))):
    if not fn.endswith('.md') or fn.startswith('_'):
        continue
    fid = fn[:3]
    text = open(os.path.join(SKILL, 'cases', fn), encoding='utf-8').read()
    lines = text.split('\n')
    theme_title = lines[0].lstrip('# ').strip()
    theme_kernels = ''
    for ln in lines[:6]:
        if ln.startswith('>'):
            theme_kernels += ln.lstrip('> ').strip() + ' '
    themes.append({'id': fid, 'title': theme_title, 'file': fn, 'kernels': theme_kernels.strip()})
    parts = re.split(r'\n## ', text)
    for part in parts[1:]:
        part_lines = part.split('\n')
        head = part_lines[0].strip()
        # 纯字符串处理标题前缀，避免正则陷阱（全角符号问题）
        title = head
        if title.startswith('案例'):
            title = title[len('案例'):]
            while title and (title[0].isdigit() or title[0] in ' 　'):
                title = title[1:]
            for wrap in ('（反例）', '(反例)'):
                if title.startswith(wrap):
                    title = title[len(wrap):]
        if title.startswith('附：'):
            title = title[2:]
        title = title.strip('｜ ')
        fields, key = {}, None
        for ln in part_lines[1:]:
            m = field_re.match(ln.strip())
            if m:
                key = m.group(1).strip()
                fields[key] = m.group(2).strip()
            elif key and ln.strip():
                if ln.startswith('---'):
                    continue
                fields[key] += ' ' + ln.strip()
        for k in fields:
            fields[k] = re.sub(r'<[^>]+>', '', fields[k]).strip()
        n = norm(title)
        meta = idx_by_title.get(n)
        if not meta:
            def lcp(a, b):
                k = 0
                for x, y in zip(a, b):
                    if x != y:
                        break
                    k += 1
                return k
            best, bl = None, 0
            for t, c in idx_by_title.items():
                l = lcp(n, t)
                if l > bl:
                    bl, best = l, c
            if bl >= 4:
                meta = best
        if not meta and n in DETAIL_OVERRIDES:
            meta = next((c for c in idx if c['id'] == DETAIL_OVERRIDES[n]), None)
        if not meta:
            unmatched.append(head)
        cases_out.append({
            'id': meta['id'] if meta else norm(title)[:12],
            'theme': fid, 'title': title, 'fields': fields,
            'source': (meta or {}).get('source', ''),
            'cite': (meta or {}).get('cite', fields.get('出处', '')),
            'kernels': (meta or {}).get('kernels', []),
        })

data = {'themes': themes, 'cases': cases_out, 'kernels': kernels,
        'built': '2026-09-22', 'repo': 'https://github.com/Justinjchen-Cornell/Mirror-of-Ages'}
with open(os.path.join(OUT, 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.MOA_DATA = ')
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write(';\n')
print(f"themes: {len(themes)}, cases: {len(cases_out)}, kernels: {len(kernels)}")
print("unmatched:", unmatched if unmatched else "无")
vals = [len(c['fields']) for c in cases_out]
print(f"fields per case: avg {statistics.mean(vals):.1f}, min {min(vals)}, max {max(vals)}")
print("ids:", [c['id'] for c in cases_out][:10], "...")

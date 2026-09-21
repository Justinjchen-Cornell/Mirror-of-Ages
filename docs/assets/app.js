/* Mirror of Ages · 鉴往知来 — site logic (vanilla JS, no deps) */
(function () {
  'use strict';
  var D = window.MOA_DATA || { cases: [], kernels: {}, themes: [] };
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var CN_ORD = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function bold(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
  function themeLabel(id) {
    var t = D.themes.filter(function (x) { return x.id === id; })[0];
    if (!t) return id;
    return t.title.split('：')[0].trim();
  }
  function cleanRef(s) {
    return String(s || '')
      .replace(/｜?\s*quotes\.json[:：][^。；）」]*/g, '')
      .replace(/（quotes\.json[:：][^）]*）/g, '')
      .replace(/\s{2,}/g, ' ').trim();
  }
  function byId(id) { return D.cases.filter(function (c) { return c.id === id; })[0]; }
  function excerpt(c) {
    var f = c.fields || {};
    var src = (f['规律启发'] || f['情境'] || f['要点'] || '').replace(/\*\*/g, '');
    return src.length > 90 ? src.slice(0, 90) + '…' : src;
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:#2b2620;color:#fff;' +
        'padding:10px 22px;border-radius:99px;font-size:13.5px;z-index:200;opacity:0;transition:opacity .25s;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.opacity = '0'; }, 1800);
  }

  /* ---------- minimal markdown renderer (headings / bold / lists / quote / table) ---------- */
  function renderMD(md) {
    var lines = md.split('\n'), out = [], i = 0, inUl = false, inTbl = false;
    function closeUl() { if (inUl) { out.push('</ul>'); inUl = false; } }
    function closeTbl() { if (inTbl) { out.push('</tbody></table>'); inTbl = false; } }
    while (i < lines.length) {
      var ln = lines[i];
      if (/^\|/.test(ln)) {
        closeUl();
        var rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        out.push('<table>');
        rows.forEach(function (r, k) {
          var cells = r.replace(/^\||\|$/g, '').split('|');
          if (k === 1 && /^[\s\-|:]+$/.test(r)) return; // separator
          var tag = (k === 0) ? 'th' : 'td';
          out.push('<tr>' + cells.map(function (c) { return '<' + tag + '>' + bold(c.trim()) + '</' + tag + '>'; }).join('') + '</tr>');
        });
        out.push('</table>');
        continue;
      }
      if (/^### /.test(ln)) { closeUl(); closeTbl(); out.push('<h3>' + bold(ln.slice(4)) + '</h3>'); }
      else if (/^## /.test(ln)) { closeUl(); closeTbl(); out.push('<h2>' + bold(ln.slice(3)) + '</h2>'); }
      else if (/^# /.test(ln)) { closeUl(); closeTbl(); out.push('<h1>' + bold(ln.slice(2)) + '</h1>'); }
      else if (/^> ?/.test(ln)) { closeUl(); closeTbl(); out.push('<blockquote>' + bold(ln.replace(/^> ?/, '')) + '</blockquote>'); }
      else if (/^- /.test(ln)) {
        closeTbl();
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push('<li>' + bold(ln.slice(2)) + '</li>');
      }
      else if (ln.trim() === '') { closeUl(); closeTbl(); }
      else { closeUl(); closeTbl(); out.push('<p>' + bold(ln) + '</p>'); }
      i++;
    }
    closeUl(); closeTbl();
    return out.join('\n');
  }

  /* ---------- case detail modal ---------- */
  var FIELD_ORDER = ['出处', '情境', '当时的选项', '选项', '判断与推理', '结果', '显性代价', '隐性代价',
    '规律启发', '风险提醒', '原文', '动作', '反例', '要点', '启示'];
  function openCase(id) {
    var c = byId(id); if (!c) return;
    $('#modalTitle').textContent = c.title;
    $('#modalMeta').textContent = (c.cite || '') + (c.source ? ' ｜ ' + c.source : '') +
      ' ｜ ' + themeLabel(c.theme) + (c.kernels.length ? ' ｜ 内核: ' + c.kernels.join('、') : '');
    var body = '', used = {};
    FIELD_ORDER.forEach(function (k) {
      if (c.fields[k] && !used[k]) {
        used[k] = 1;
        var q = (k === '原文') ? ' quote-block' : '';
        body += '<div class="fitem' + q + '"><h4>' + esc(k) + '</h4><p>' + bold(c.fields[k]) + '</p></div>';
      }
    });
    Object.keys(c.fields).forEach(function (k) {
      if (!used[k]) body += '<div class="fitem"><h4>' + esc(k) + '</h4><p>' + bold(c.fields[k]) + '</p></div>';
    });
    $('#modalBody').innerHTML = body;
    $('#modalMask').classList.add('show');
  }
  function closeModal() { $('#modalMask').classList.remove('show'); }

  /* ---------- library ---------- */
  var libState = { q: '', theme: '', kernel: '' };
  function renderLibrary() {
    var q = libState.q.trim().toLowerCase();
    var list = D.cases.filter(function (c) {
      if (libState.theme && c.theme !== libState.theme) return false;
      if (libState.kernel && c.kernels.indexOf(libState.kernel) < 0) return false;
      if (q) {
        var hay = (c.title + ' ' + (c.cite || '') + ' ' + Object.keys(c.fields).map(function (k) { return c.fields[k]; }).join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    $('#libCount').textContent = '共 ' + list.length + ' 张';
    $('#caseGrid').innerHTML = list.map(function (c) {
      return '<article class="case-card" data-id="' + c.id + '">' +
        '<div class="top"><span>' + esc(themeLabel(c.theme)) + '</span><span class="src">' + esc(c.source || '') + '</span></div>' +
        '<h3>' + esc(c.title) + '</h3>' +
        '<p class="ex">' + esc(excerpt(c)) + '</p>' +
        '<div class="ks">' + c.kernels.map(function (k) { return '<span class="kmini">' + esc(k) + '</span>'; }).join('') + '</div>' +
        '</article>';
    }).join('') || '<p style="color:#6b6255">没有匹配的案例，换个关键词试试。</p>';
  }
  function renderLibFilters() {
    var sel = $('#themeSelect');
    sel.innerHTML = '<option value="">全部主题</option>' + D.themes.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.title.split('：')[0]) + '</option>';
    }).join('');
    var kf = $('#kernelFilter');
    kf.innerHTML = '<span class="chip active" data-k="">全部内核</span>' + Object.keys(D.kernels).map(function (k) {
      return '<span class="chip" data-k="' + esc(k) + '">' + esc(k) + '</span>';
    }).join('');
    kf.addEventListener('click', function (e) {
      var t = e.target.closest('.chip'); if (!t) return;
      libState.kernel = t.getAttribute('data-k');
      Array.prototype.forEach.call(kf.children, function (c) { c.classList.toggle('active', c === t); });
      renderLibrary();
    });
  }

  /* ---------- kernels section ---------- */
  function renderKernels() {
    var html = Object.keys(D.kernels).map(function (name) {
      var k = D.kernels[name];
      var links = (k.cases || []).map(function (cid) {
        var c = byId(cid);
        if (!c) return '';
        return '<span class="klink" data-id="' + cid + '">' + esc(c.title.split('：')[0].split('｜')[0].slice(0, 14)) + '</span>';
      }).join('');
      return '<div class="kcard"><h3>' + esc(name) + '</h3><p class="d">' + esc(k.desc) + '</p>' +
        '<p class="terms">检索词：' + esc((k.terms || []).join(' / ')) + '</p>' +
        '<div class="cs">' + links + '</div></div>';
    }).join('');
    $('#kernelGrid').innerHTML = html;
  }

  /* ---------- workspace ---------- */
  var ws = { kernels: [], candidates: [], selected: {} };
  function matchKernels(text) {
    var res = [];
    Object.keys(D.kernels).forEach(function (name) {
      var k = D.kernels[name], score = 0, hits = [];
      (k.terms || []).concat(k.modern || []).forEach(function (t) {
        if (t && text.indexOf(t) >= 0) { score += t.length; hits.push(t); }
      });
      if (text.indexOf(name) >= 0) score += 8;
      (k.cases || []).forEach(function (cid) {
        var c = byId(cid);
        if (c && text.indexOf(c.title.slice(0, 6)) >= 0) score += 4;
      });
      if (score > 0) res.push({ name: name, score: score, hits: hits });
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res.slice(0, 5);
  }
  function candidatesFor(kernels) {
    if (!kernels.length) return [];
    var ranked = D.cases.map(function (c) {
      var best = 99, pos = 99;
      c.kernels.forEach(function (k) {
        var ki = kernels.indexOf(k);
        if (ki >= 0) {
          var p = (D.kernels[k].cases || []).indexOf(c.id);
          if (ki < best || (ki === best && p >= 0 && p < pos)) { best = ki; pos = (p >= 0 ? p : 99); }
        }
      });
      return { c: c, best: best, pos: pos };
    }).filter(function (x) { return x.best < 99; });
    ranked.sort(function (a, b) { return a.best - b.best || a.pos - b.pos; });
    return ranked.slice(0, 8).map(function (x) { return x.c; });
  }
  function renderWsSteps(recommend) {
    // 内核区
    var recNames = (recommend || []).map(function (r) { return r.name; });
    if (!ws.kernels.length && recNames.length) ws.kernels = recNames.slice(0, 2);
    var all = Object.keys(D.kernels);
    var html = '<p class="hint">💡 推荐内核（按你的描述匹配，点击可增删）：</p><div class="kchips" id="recChips">' +
      (recommend && recommend.length
        ? recommend.map(function (r) {
          return '<span class="chip' + (ws.kernels.indexOf(r.name) >= 0 ? ' active' : '') + '" data-k="' + esc(r.name) + '">' +
            esc(r.name) + '<span class="n">命中: ' + esc(r.hits.slice(0, 3).join('/') || '相关') + '</span></span>';
        }).join('')
        : '<span class="chip plain">没有直接命中——直接从下方全量内核里选</span>') +
      '</div><p class="hint" style="margin-top:14px">全部 28 个场景内核：</p><div class="kchips" id="allChips">' +
      all.map(function (k) {
        return '<span class="chip' + (ws.kernels.indexOf(k) >= 0 ? ' active' : '') + '" data-k="' + esc(k) + '">' + esc(k) + '</span>';
      }).join('') + '</div>';
    $('#kernelArea').innerHTML = html;
    refreshWs(recommend);
  }
  function refreshWs(recommend) {
    // 已选内核 chips 状态同步
    Array.prototype.forEach.call(document.querySelectorAll('#kernelArea .chip[data-k]'), function (el) {
      el.classList.toggle('active', ws.kernels.indexOf(el.getAttribute('data-k')) >= 0);
    });
    // 候选案例
    ws.candidates = candidatesFor(ws.kernels);
    if (!Object.keys(ws.selected).length) {
      ws.candidates.slice(0, 3).forEach(function (c) { ws.selected[c.id] = 1; });
    }
    var html = ws.candidates.length ? ws.candidates.map(function (c) {
      return '<div class="pick' + (ws.selected[c.id] ? ' on' : '') + '" data-id="' + c.id + '">' +
        '<h4>' + esc(c.title) + '</h4>' +
        '<div class="meta">' + esc(c.cite || '') + ' ｜ ' + esc(themeLabel(c.theme)) + '</div>' +
        '<div class="ex">' + esc(excerpt(c)) + '</div></div>';
    }).join('') : '<p class="hint">先选择至少一个场景内核。</p>';
    $('#candidatesArea').innerHTML = html;
    var nSel = Object.keys(ws.selected).length;
    $('#btnGen').disabled = nSel === 0;
    $('#btnGen').textContent = '生成推演报告（已选 ' + nSel + ' 例）';
  }
  function stripQ(s) { return cleanRef(s); }
  function buildReport() {
    var input = $('#situation').value.trim();
    var cases = D.cases.filter(function (c) { return ws.selected[c.id]; });
    if (!input || !cases.length) return '';
    var title = input.split(/[。\n]/)[0].slice(0, 40);
    var date = new Date().toISOString().slice(0, 10);
    var md = '# 抉择推演：' + title + '\n\n' +
      '> 生成自 Mirror of Ages · 鉴往知来 ｜ ' + date + '\n' +
      '> 流程：场景内核 → 历史案例 → 选项/判断/代价拆解 → 规律与风险\n\n' +
      '## 0. 你的处境（内核提炼）\n\n' + input + '\n\n' +
      '**场景内核**：' + (ws.kernels.join('、') || '（未选择）') + '\n\n' +
      '## 1. 历史镜鉴（' + cases.length + ' 例）\n';
    cases.forEach(function (c, i) {
      md += '\n### 案例' + (CN_ORD[i] || (i + 1)) + '｜' + c.title + '\n\n';
      md += '- **出处**：' + stripQ(c.fields['出处'] || c.cite) + '\n';
      FIELD_ORDER.forEach(function (k) {
        if (k !== '出处' && c.fields[k]) md += '- **' + k + '**：' + stripQ(c.fields[k]) + '\n';
      });
    });
    md += '\n## 2. 结构对照（自己填）\n\n' +
      '| 维度 | 历史场景 | 你的处境 | 可迁移性 |\n|---|---|---|---|\n' +
      '| 权力/利益结构 |  |  |  |\n| 信息条件 |  |  |  |\n| 退出成本 |  |  |  |\n| 时代差异 |  |  |  |\n\n' +
      '## 3. 规律启发（来自案例）\n\n';
    cases.forEach(function (c) { if (c.fields['规律启发']) md += '- ' + stripQ(c.fields['规律启发']) + '\n'; });
    md += '\n## 4. 风险提醒（来自案例）\n\n';
    cases.forEach(function (c) { if (c.fields['风险提醒']) md += '- ⚠️ ' + stripQ(c.fields['风险提醒']) + '\n'; });
    md += '\n> 补充自查：失效条件 / 幸存者偏差 / 时代差异（见 SKILL.md 质量闸门）\n';
    md += '\n## 5. 下一步（自己填）\n\n- [ ] ……\n';
    return md;
  }
  function generate() {
    var md = buildReport();
    if (!md) { toast('请先填写处境并选择案例'); return; }
    $('#reportMd').textContent = md;
    $('#reportPreview').innerHTML = renderMD(md);
    $('#reportArea').style.display = 'grid';
    $('#reportArea').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- init ---------- */
  function init() {
    // nav anchor default
    renderLibFilters();
    renderLibrary();
    renderKernels();

    // library events
    $('#searchInput').addEventListener('input', function () { libState.q = this.value; renderLibrary(); });
    $('#themeSelect').addEventListener('change', function () { libState.theme = this.value; renderLibrary(); });
    $('#caseGrid').addEventListener('click', function (e) {
      var el = e.target.closest('.case-card'); if (el) openCase(el.getAttribute('data-id'));
    });
    $('#kernelGrid').addEventListener('click', function (e) {
      var el = e.target.closest('.klink'); if (el) openCase(el.getAttribute('data-id'));
    });

    // modal
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalMask').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

    // workspace
    $('#kernelArea').addEventListener('click', function (e) {
      var t = e.target.closest('.chip[data-k]'); if (!t) return;
      var k = t.getAttribute('data-k');
      var idx = ws.kernels.indexOf(k);
      if (idx >= 0) ws.kernels.splice(idx, 1); else ws.kernels.push(k);
      refreshWs();
    });
    $('#btnMatch').addEventListener('click', function () {
      var text = $('#situation').value.trim();
      if (!text) { toast('先在框里说说你的处境'); return; }
      ws.kernels = []; ws.selected = {};
      var rec = matchKernels(text);
      renderWsSteps(rec);
      $$('#step2, #step3').forEach(function (el) { el.style.display = 'block'; });
      $('#step2').scrollIntoView({ behavior: 'smooth' });
    });
    $('#candidatesArea').addEventListener('click', function (e) {
      var el = e.target.closest('.pick'); if (!el) return;
      var id = el.getAttribute('data-id');
      if (ws.selected[id]) delete ws.selected[id]; else ws.selected[id] = 1;
      el.classList.toggle('on');
      refreshWs();
    });
    $('#btnGen').addEventListener('click', generate);
    $('#btnSample').addEventListener('click', function () {
      $('#situation').value = '我在公司做到二号位，业务是我一手带起来的。最近半年，老板的权限调整越来越频繁：' +
        '预算审批被收回、核心客户转他直管、战略会不再叫我。不是我做错了什么，而是我"太对了"。' +
        '我该主动交权示弱，还是另谋出路？';
      $('#btnMatch').click();
    });
    $('#btnCopy').addEventListener('click', function () {
      var md = $('#reportMd').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(function () { toast('已复制推演报告 Markdown'); }, function () { fallbackCopy(md); });
      } else fallbackCopy(md);
    });
    function fallbackCopy(md) {
      var ta = document.createElement('textarea');
      ta.value = md; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已复制推演报告 Markdown'); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
    $('#btnDownload').addEventListener('click', function () {
      var md = $('#reportMd').textContent;
      var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '推演报告-' + new Date().toISOString().slice(0, 10) + '.md';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast('已下载 .md 文件');
    });
    // advanced toggle
    var adv = $('#advToggle');
    if (adv) adv.addEventListener('click', function () {
      var x = $('#advArea');
      var show = x.style.display === 'none';
      x.style.display = show ? 'block' : 'none';
      adv.textContent = show ? '收起高阶检索 ▼' : '展开高阶检索 ▶';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

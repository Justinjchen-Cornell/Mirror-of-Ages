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
    $('#btnGen').textContent = '生成报告（模板版 · 已选 ' + nSel + ' 例）';
    var aiB = $('#btnAI'); if (aiB && !aiB.textContent.match(/推演中/)) aiB.disabled = nSel === 0;
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

  /* ---------- AI 精算版（BYOK · OpenAI 兼容协议） ---------- */
  var AI_PRESETS = {
    deepseek: { name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    siliconflow: { name: '硅基流动 SiliconFlow', base: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
    moonshot: { name: 'Kimi (Moonshot)', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat-v3.1:free' },
    openai: { name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    custom: { name: '自定义（OpenAI 兼容）', base: '', model: '' }
  };
  var aiCfg = (function () {
    try { return JSON.parse(localStorage.getItem('moa_ai') || 'null') || { provider: 'deepseek', base: '', key: '', model: '' }; }
    catch (e) { return { provider: 'deepseek', base: '', key: '', model: '' }; }
  })();
  function saveCfg(c) {
    aiCfg = c;
    try { localStorage.setItem('moa_ai', JSON.stringify(c)); } catch (e) {}
    updateAiStatus();
  }
  function cfgReady() { return !!(aiCfg.base && aiCfg.key && aiCfg.model); }
  function updateAiStatus() {
    var el = $('#aiStatus'); if (!el) return;
    if (cfgReady()) {
      var pn = (AI_PRESETS[aiCfg.provider] && AI_PRESETS[aiCfg.provider].name) || '自定义';
      el.innerHTML = 'AI: <b>' + esc(pn) + '</b> ✓';
    } else {
      el.innerHTML = 'AI: 未配置 → 点「⚙️ AI 设置」';
    }
  }
  function openAiModal() {
    var sel = $('#aiProvider');
    sel.innerHTML = Object.keys(AI_PRESETS).map(function (k) {
      return '<option value="' + k + '">' + esc(AI_PRESETS[k].name) + '</option>';
    }).join('');
    sel.value = aiCfg.provider || 'deepseek';
    var p = AI_PRESETS[sel.value];
    $('#aiBase').value = aiCfg.base || (p && p.base) || '';
    $('#aiKey').value = aiCfg.key || '';
    $('#aiModel').value = aiCfg.model || (p && p.model) || '';
    $('#aiModal').classList.add('show');
  }
  function closeAiModal() { var m = $('#aiModal'); if (m) m.classList.remove('show'); }

  var AI_SYS = '你是「鉴往知来 · Mirror of Ages」的抉择推演引擎：基于中国历史案例，为用户生成结构化推演报告。\n\n' +
    '【铁律】\n' +
    '1. 只允许使用【可用历史案例】中提供的史实与引文；严禁编造、外扩任何其他历史细节。\n' +
    '2. 引文必须与提供的案例原文完全一致，并标注出处（卷次/篇名）。\n' +
    '3. 显性代价（钱/命/位置）与隐性代价（名声/结构/后代）分开陈述。\n' +
    '4. "判断对错"与"结果好坏"分开评价——判断正确也可能失败（幸存者偏差）。\n' +
    '5. 禁止宿命式断言；你是思维脚手架，不是决策替代。\n\n' +
    '【输出格式（Markdown）】\n' +
    '# 抉择推演：{一行标题}\n\n' +
    '> 生成自 Mirror of Ages · 鉴往知来（AI 精算版）\n\n' +
    '## 0. 你的处境（内核提炼）\n把用户处境结构化为：决策者位置 × 关键关系 × 核心利害 × 硬约束；结尾一行「场景内核：…」。\n\n' +
    '## 1. 历史镜鉴\n每个案例一小节（### 案例一｜标题），包含：\n- 结构同构点（与用户处境哪里相同、哪里不同）\n- 当事人的选项与判断（严格来自案例）\n- 结果与显性/隐性代价\n- 对用户的镜鉴点（1-2 句）\n\n' +
    '## 2. 结构对照表\n| 维度 | 历史场景 | 你的处境 | 可迁移性 |\n至少覆盖：权力/利益结构、信息条件、退出成本、时代差异。\n\n' +
    '## 3. 规律启发\n2-4 条，每条注明依据案例名。\n\n' +
    '## 4. 风险提醒\n每条含「失效条件：若……则失效」；末尾提示样本偏差与时代差异。\n\n' +
    '## 5. 可选行动提示（非决策替代）\n3 个自查问题 + 一个 3-5 项观察清单。\n\n' +
    '结尾固定一行：> AI 生成 · 引文以案例库 quotes.json 为准。';

  function caseContext(c) {
    var order = ['出处', '情境', '当时的选项', '判断与推理', '结果', '显性代价', '隐性代价', '规律启发', '风险提醒', '原文'];
    var out = '### ' + c.title + '（' + themeLabel(c.theme) + '）\n';
    order.forEach(function (k) {
      if (c.fields[k]) out += '- ' + k + '：' + cleanRef(c.fields[k]).replace(/\*\*/g, '') + '\n';
    });
    return out;
  }
  function buildAIMessages(input, cases) {
    var ctx = cases.map(caseContext).join('\n');
    var user = '【用户处境】\n' + input + '\n\n【场景内核】' + (ws.kernels.join('、') || '（未标注）') +
      '\n\n【可用历史案例】\n' + ctx + '\n请生成推演报告。';
    return [
      { role: 'system', content: AI_SYS },
      { role: 'user', content: user }
    ];
  }
  function callAI(messages, onDelta) {
    return new Promise(function (resolve, reject) {
      var url = aiCfg.base.replace(/\/+$/, '') + '/chat/completions';
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiCfg.key },
        body: JSON.stringify({ model: aiCfg.model, stream: true, temperature: 0.5, messages: messages })
      }).then(function (resp) {
        if (!resp.ok) {
          resp.text().then(function (t) { reject(new Error('HTTP ' + resp.status + '：' + t.slice(0, 180))); }, function () { reject(new Error('HTTP ' + resp.status)); });
          return;
        }
        var reader = resp.body.getReader();
        var dec = new TextDecoder();
        var buf = '', full = '';
        (function pump() {
          reader.read().then(function (r) {
            if (r.done) { resolve(full); return; }
            buf += dec.decode(r.value, { stream: true });
            var lines = buf.split('\n');
            buf = lines.pop();
            lines.forEach(function (ln) {
              ln = ln.trim();
              if (ln.indexOf('data:') !== 0) return;
              var d = ln.slice(5).trim();
              if (d === '[DONE]') return;
              try {
                var j = JSON.parse(d);
                var delta = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || '';
                if (delta) { full += delta; onDelta(full); }
              } catch (e) {}
            });
            pump();
          }, reject);
        })();
      }, function (err) { reject(new Error('网络异常：' + err.message + '（若为 CORS/连接错误，请更换服务商）')); });
    });
  }
  function generateAI() {
    var input = $('#situation').value.trim();
    var cases = D.cases.filter(function (c) { return ws.selected[c.id]; });
    if (!input || !cases.length) { toast('先填写处境并选择案例'); return; }
    if (!cfgReady()) { openAiModal(); toast('先配置 AI（BYOK，1 分钟）'); return; }
    var area = $('#reportArea');
    area.style.display = 'grid';
    $('#reportMd').textContent = '✨ AI 正在推演（streaming…）';
    $('#reportPreview').innerHTML = '<p class="hint">✨ AI 正在精算——用你的处境 × 选中的 ' + cases.length + ' 个历史案例生成个性化推演…</p>';
    var btn = $('#btnAI'); btn.disabled = true; btn.textContent = '✨ 推演中…';
    area.scrollIntoView({ behavior: 'smooth' });
    callAI(buildAIMessages(input, cases), function (soFar) {
      $('#reportMd').textContent = soFar;
      $('#reportMd').scrollTop = $('#reportMd').scrollHeight;
    }).then(function (full) {
      $('#reportMd').textContent = full;
      $('#reportPreview').innerHTML = renderMD(full);
      toast('✨ AI 推演完成 — 引文以案例库为准');
    }).catch(function (err) {
      $('#reportMd').textContent = '生成失败：' + err.message + '\n\n排查建议：\n1) 检查 API Key 是否正确、账户是否有余额\n2) 若为 CORS/网络错误 → 打开「⚙️ AI 设置」换一个服务商（DeepSeek / 硅基流动 / Kimi / OpenRouter 均支持浏览器直连）\n3) Base URL 不要带 /chat/completions 后缀';
      $('#reportPreview').innerHTML = '<p class="hint">生成失败，排查建议见左侧。</p>';
      toast('生成失败，见提示');
    }).then(function () {
      btn.disabled = false; btn.textContent = '✨ AI 精算版';
    });
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
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); closeAiModal(); } });

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
    // AI (BYOK) wiring
    $('#btnAI').addEventListener('click', generateAI);
    $('#btnAISettings').addEventListener('click', openAiModal);
    $('#aiClose').addEventListener('click', closeAiModal);
    $('#aiModal').addEventListener('click', function (e) { if (e.target === this) closeAiModal(); });
    $('#aiCancel').addEventListener('click', closeAiModal);
    $('#aiProvider').addEventListener('change', function () {
      var p = AI_PRESETS[this.value];
      if (p) { if (p.base) $('#aiBase').value = p.base; if (p.model) $('#aiModel').value = p.model; }
    });
    $('#aiSave').addEventListener('click', function () {
      saveCfg({
        provider: $('#aiProvider').value,
        base: $('#aiBase').value.trim(),
        key: $('#aiKey').value.trim(),
        model: $('#aiModel').value.trim()
      });
      closeAiModal(); toast('AI 配置已保存（仅存本机浏览器）');
    });
    updateAiStatus();

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

/* 領隊考照練習 — 單頁 App（無框架） */
(() => {
  'use strict';

  const STORE_KEY = 'p11.tourleader.v1';
  const SUBJECT_ORDER = ['practice', 'law', 'resources', 'english'];
  // 每科正式題數與時間（115 年新制）
  const EXAM_SPEC = {
    practice: { count: 50, minutes: 60 },
    law: { count: 50, minutes: 60 },
    resources: { count: 50, minutes: 60 },
    english: { count: 80, minutes: 80 },
  };
  const PASS_LINE = 60;
  const LETTERS = ['A', 'B', 'C', 'D'];

  let BANK = null;          // 題庫
  let QMAP = {};            // id → 題目
  let state = loadState();  // 作答紀錄
  let session = null;       // 目前練習／考試
  let timerId = null;

  const $app = document.getElementById('app');
  const $title = document.getElementById('title');
  const $back = document.getElementById('backBtn');
  const $topRight = document.getElementById('topRight');

  /* ---------- 儲存 ---------- */
  function loadState() {
    const empty = { rec: {}, exams: [], days: {}, session: null };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return empty;
      return Object.assign(empty, JSON.parse(raw));
    } catch (e) { return empty; }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 私密模式等情況：只保留在記憶體 */ }
  }

  /* ---------- 工具 ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtStem = (s) => {
    let h = esc(s).replace(/_{3,}/g, '<span class="blank"></span>');
    // 題幹內的 ①②③ 列舉各自換行
    if (/①/.test(h) && /②/.test(h)) h = h.replace(/\s*([①②③④⑤⑥⑦⑧⑨⑩])/g, '<br>$1').replace(/^<br>/, '');
    return h;
  };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const today = () => new Date().toISOString().slice(0, 10);
  const subjName = (s) => (BANK && BANK.subjects[s]) || s;
  const isCorrect = (q, letter) => q.a.includes(letter);
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function record(q, letter) {
    const r = state.rec[q.id] || { c: 0, w: 0, streak: 0, wrongBook: false };
    const ok = isCorrect(q, letter);
    if (ok) { r.c++; r.streak++; if (r.wrongBook && r.streak >= 2) r.wrongBook = false; }
    else { r.w++; r.streak = 0; r.wrongBook = true; }
    r.last = letter; r.ts = Date.now();
    state.rec[q.id] = r;
    state.days[today()] = (state.days[today()] || 0) + 1;
    saveState();
    return ok;
  }

  function subjectStats(s) {
    const qs = BANK.questions.filter((q) => q.s === s);
    let done = 0, c = 0, w = 0;
    qs.forEach((q) => { const r = state.rec[q.id]; if (r) { done++; c += r.c; w += r.w; } });
    return { total: qs.length, done, acc: pct(c, c + w), attempts: c + w };
  }
  const wrongIds = () => BANK.questions.filter((q) => state.rec[q.id] && state.rec[q.id].wrongBook).map((q) => q.id);

  function streakDays() {
    let n = 0; const d = new Date();
    for (;;) {
      const k = d.toISOString().slice(0, 10);
      if (state.days[k]) { n++; d.setDate(d.getDate() - 1); } else break;
    }
    return n;
  }

  /* ---------- 閱讀拆解／文法 共用元件 ---------- */
  const passageRange = (key) => (key.match(/p(\d+)-(\d+)$/) || []).slice(1).join('–');
  function sentenceHtml(s) {
    return `<details class="sent"><summary>${esc(s.en)}</summary>
      <div class="sent-body">
        <p class="zh">${esc(s.zh)}</p>
        ${s.w && s.w.length ? `<div class="words">${s.w.map(([w, z]) => `<span class="word"><b>${esc(w)}</b> ${esc(z)}</span>`).join('')}</div>` : ''}
        ${s.s ? `<p class="struct"><span class="tag">句子結構</span> ${esc(s.s)}</p>` : ''}
      </div></details>`;
  }
  // help=false：模擬考作答中，只給原文
  function renderPassage(key, help) {
    const r = BANK.reading && BANK.reading[key];
    const label = `閱讀文章（第 ${passageRange(key)} 題）`;
    if (!help || !r) {
      const text = BANK.passages[key] || '';
      return `<details class="passage" open><summary>${label}</summary>${text.split(/\n\n+/).map((t) => `<p>${esc(t)}</p>`).join('')}</details>`;
    }
    return `<details class="passage" open><summary>${label}・${esc(r.title)}</summary>
      <details class="summary-box"><summary>💡 先看中文大意</summary><p>${esc(r.summary)}</p></details>
      <p class="muted" style="margin:8px 0 4px">點任何一句，可以看翻譯、單字和句子結構。</p>
      ${r.paras.map((p) => `<div class="para">${p.map(sentenceHtml).join('')}</div>`).join('')}
    </details>`;
  }
  function grammarBox(q) {
    if (!q.g) return '';
    const t = (BANK.grammar || []).find((x) => x.id === q.gt);
    return `<div class="gnote"><h3>📘 文法重點${t ? `：${esc(t.title)}` : ''}</h3><p>${esc(q.g)}</p>
      ${t ? `<a href="#/grammar/${t.id}">看這個文法的完整說明 →</a>` : ''}</div>`;
  }

  /* ---------- 閱讀精讀 ---------- */
  function reading(key) {
    $title.textContent = '閱讀精讀';
    const keys = Object.keys(BANK.reading || {}).sort().reverse();
    if (!key || !BANK.reading[key]) {
      $app.innerHTML = `<div class="card"><p style="margin-top:0">每篇考古題文章都拆成一句一句，點開可以看<strong>中文翻譯、難字和句子結構</strong>。</p>
        <p class="muted" style="margin:0">建議讀法：① 先看中文大意 → ② 讀英文，看不懂的句子再點開 → ③ 做這篇的 5 題。</p></div>
        <div class="card">${keys.map((k) => { const r = BANK.reading[k]; const ids = BANK.questions.filter((q) => q.p === k); const done = ids.filter((q) => state.rec[q.id]).length; return `
          <div class="list-item row"><div class="spacer"><strong>${esc(r.title)}</strong><div class="muted">${k.slice(0, 3)} 年・第 ${passageRange(k)} 題・已練 ${done}/${ids.length}</div></div><button class="btn" data-go="#/reading/${k}">開始讀</button></div>`; }).join('')}</div>`;
      bindGo();
      return;
    }
    const r = BANK.reading[key];
    const ids = BANK.questions.filter((q) => q.p === key).sort((a, b) => a.n - b.n).map((q) => q.id);
    $app.innerHTML = `
      <div class="card"><div class="muted">${key.slice(0, 3)} 年・英語・第 ${passageRange(key)} 題</div><h2 style="margin:4px 0 10px">${esc(r.title)}</h2>
        <details class="summary-box" open><summary>💡 中文大意</summary><p>${esc(r.summary)}</p></details></div>
      <div class="row" style="margin-bottom:10px"><button class="btn" id="expandAll">全部展開翻譯</button><button class="btn" id="collapseAll">全部收合</button></div>
      <div class="card reading-page">${r.paras.map((p) => `<div class="para">${p.map(sentenceHtml).join('')}</div>`).join('')}</div>
      <button class="btn primary block" id="practiceBtn">讀完了，練習這篇的 ${ids.length} 題</button>`;
    $app.querySelector('#expandAll').onclick = () => $app.querySelectorAll('.reading-page details').forEach((d) => { d.open = true; });
    $app.querySelector('#collapseAll').onclick = () => $app.querySelectorAll('.reading-page details').forEach((d) => { d.open = false; });
    $app.querySelector('#practiceBtn').onclick = () => startSession({ mode: 'practice', ids, label: `閱讀：${r.title}` });
  }

  /* ---------- 文法小教室 ---------- */
  function grammar(id) {
    $title.textContent = '文法小教室';
    const topics = BANK.grammar || [];
    const t = topics.find((x) => x.id === id);
    if (!t) {
      $app.innerHTML = `<div class="card"><p style="margin:0">三年考古題裡考過的文法，整理成 ${topics.length} 個主題。每個主題有白話說明、例句、常見陷阱，以及考過的題目。</p></div>
        <div class="card">${topics.map((x, i) => { const done = x.qs.filter((q) => state.rec[q]).length; return `
          <div class="list-item row"><div class="spacer"><strong>${i + 1}. ${esc(x.title)}</strong><div class="muted">考過 ${x.qs.length} 題・已練 ${done}</div></div><button class="btn" data-go="#/grammar/${x.id}">看說明</button></div>`; }).join('')}</div>`;
      bindGo();
      return;
    }
    $app.innerHTML = `
      <div class="card"><h2>${esc(t.title)}</h2><p class="rule">${esc(t.rule)}</p>${t.suffix ? `<p class="muted">${esc(t.suffix)}</p>` : ''}</div>
      <div class="card"><h2>例句</h2>${t.examples.map(([en, zh]) => `<div class="list-item"><div><b>${esc(en)}</b></div><div class="muted">${esc(zh)}</div></div>`).join('')}</div>
      ${t.traps ? `<div class="card trap"><h2>⚠ 常見陷阱</h2><p style="margin:0">${esc(t.traps)}</p></div>` : ''}
      <div class="card"><h2>考古題裡的這個文法（${t.qs.length} 題）</h2>
        ${t.qs.map((qid) => { const q = QMAP[qid]; return `<details class="list-item"><summary>${q.y} 年第 ${q.n} 題：${fmtStem(q.q.length > 70 ? q.q.slice(0, 70) + '…' : q.q)}</summary>
          <p class="stem" style="font-size:16px;margin-top:8px">${fmtStem(q.q)}</p>
          <ol type="A" style="margin:0 0 8px;padding-left:22px">${q.o.map((o, i) => `<li style="${q.a.includes(LETTERS[i]) ? 'color:var(--ok);font-weight:600' : ''}">${esc(o)}</li>`).join('')}</ol>
          <p class="muted" style="margin:0">${esc(q.g)}</p></details>`; }).join('')}
        <button class="btn primary block" id="gPractice" style="margin-top:12px">練習這 ${t.qs.length} 題</button>
      </div>
      <button class="btn block" data-go="#/grammar">← 回文法主題列表</button>`;
    bindGo();
    $app.querySelector('#gPractice').onclick = () => startSession({ mode: 'practice', ids: shuffle(t.qs), label: `文法：${t.title.split('：')[0]}` });
  }

  /* ---------- 路由 ---------- */
  const routes = { home, setup, quiz, result, wrong, stats, browse, reading, grammar };
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function render() {
    clearInterval(timerId); timerId = null;
    $topRight.textContent = '';
    const [name, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const fn = routes[name] || home;
    $back.hidden = fn === home;
    fn(arg);
    window.scrollTo(0, 0);
  }
  $back.addEventListener('click', () => {
    if (session && session.mode === 'mock' && !session.finished && location.hash.startsWith('#/quiz')) {
      if (!confirm('模擬考還沒交卷，確定離開嗎？（進度會保留，可從首頁繼續）')) return;
    }
    go('#/home');
  });
  window.addEventListener('hashchange', render);

  /* ---------- 首頁 ---------- */
  function home() {
    $title.textContent = '領隊考照練習';
    const totalQ = BANK.questions.length;
    const doneQ = BANK.questions.filter((q) => state.rec[q.id]).length;
    let c = 0, w = 0; Object.values(state.rec).forEach((r) => { c += r.c; w += r.w; });
    const wr = wrongIds().length;
    const resume = state.session && !state.session.finished && state.session.ids && state.session.ids.length;

    $app.innerHTML = `
      ${resume ? `<div class="card row"><div class="spacer"><strong>繼續上次的${state.session.mode === 'mock' ? '模擬考' : '練習'}</strong><div class="muted">${esc(state.session.label)}・第 ${state.session.idx + 1} / ${state.session.ids.length} 題</div></div><button class="btn primary" data-act="resume">繼續</button></div>` : ''}
      <div class="card hero">
        <div><div class="big">${doneQ}<span class="muted" style="font-size:16px"> / ${totalQ}</span></div><div class="label">已練習題數</div></div>
        <div><div class="big">${c + w ? pct(c, c + w) + '%' : '—'}</div><div class="label">整體答對率</div></div>
        <div><div class="big">${streakDays()}</div><div class="label">連續天數</div></div>
      </div>
      <div class="actions">
        <button class="action primary" data-go="#/setup/practice"><strong>隨機練習</strong><span>答完馬上看解析</span></button>
        <button class="action" data-go="#/setup/mock"><strong>模擬考</strong><span>照正式題數計時</span></button>
        <button class="action" data-go="#/wrong"><strong>錯題本</strong><span>${wr ? `${wr} 題待複習` : '目前沒有錯題'}</span></button>
        <button class="action" data-go="#/stats"><strong>弱點分析</strong><span>看哪裡最常錯</span></button>
        <button class="action" data-go="#/reading"><strong>閱讀精讀</strong><span>文章逐句翻譯拆解</span></button>
        <button class="action" data-go="#/grammar"><strong>文法小教室</strong><span>${(BANK.grammar || []).length} 個考過的文法</span></button>
      </div>
      <div class="card">
        <h2>各科進度</h2>
        ${SUBJECT_ORDER.map((s) => { const st = subjectStats(s); return `
          <div class="subj">
            <div class="name"><div>${esc(subjName(s))}</div>
              <div class="bar"><i style="width:${pct(st.done, st.total)}%"></i></div>
              <div class="muted">已練 ${st.done} / ${st.total} 題</div></div>
            <div class="pct">${st.attempts ? st.acc + '%' : '—'}</div>
          </div>`; }).join('')}
      </div>
      <div class="card">
        <h2>題庫內容</h2>
        <p class="muted" style="margin:0 0 8px">目前收錄：${[...new Set(BANK.papers.map((p) => p.y))].sort().join('、')} 年觀光署「導遊人員及領隊人員評量測驗」通用制外語領隊（英語）四科考畢試題，共 ${totalQ} 題，每題附解析。標示「待查核」的題目，解析依官方答案撰寫，相關法規請以最新版本為準。</p>
        <button class="btn" data-go="#/browse">依科目瀏覽全部題目</button>
      </div>
      <p class="muted" style="text-align:center">題目來源：交通部觀光署導遊人員與領隊人員評量網路報名資訊系統・考畢試題</p>`;
    $app.querySelector('[data-act="resume"]')?.addEventListener('click', () => { session = state.session; go('#/quiz'); });
    bindGo();
  }
  function bindGo() { $app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go))); }

  /* ---------- 設定（練習／模擬考） ---------- */
  function setup(mode) {
    const isMock = mode === 'mock';
    $title.textContent = isMock ? '模擬考' : '隨機練習';
    const years = [...new Set(BANK.questions.map((q) => q.y))].sort((a, b) => b - a);
    const opt = { subjects: new Set(isMock ? ['practice'] : SUBJECT_ORDER), count: 20, filter: 'all', year: isMock ? years[0] : 'all' };

    const draw = () => {
      const pool = buildPool(opt, isMock);
      $app.innerHTML = `
        <div class="card">
          <div class="field"><span class="flabel">科目${isMock ? '（擇一）' : '（可複選）'}</span>
            <div class="chips">${SUBJECT_ORDER.map((s) => `<button class="chip" data-s="${s}" aria-pressed="${opt.subjects.has(s)}">${esc(subjName(s))}</button>`).join('')}</div></div>
          <div class="field"><span class="flabel">年度</span>
            <div class="chips">${isMock ? '' : `<button class="chip" data-y="all" aria-pressed="${opt.year === 'all'}">全部</button>`}${years.map((y) => `<button class="chip" data-y="${y}" aria-pressed="${opt.year == y}">${y} 年</button>`).join('')}</div></div>
          ${isMock ? '' : `
          <div class="field"><span class="flabel">題數</span>
            <div class="chips">${[10, 20, 30, 50].map((n) => `<button class="chip" data-n="${n}" aria-pressed="${opt.count === n}">${n} 題</button>`).join('')}</div></div>
          <div class="field"><span class="flabel">出題範圍</span>
            <div class="chips">
              <button class="chip" data-f="all" aria-pressed="${opt.filter === 'all'}">全部題目</button>
              <button class="chip" data-f="new" aria-pressed="${opt.filter === 'new'}">只出沒做過的</button>
              <button class="chip" data-f="weak" aria-pressed="${opt.filter === 'weak'}">曾經答錯的</button>
            </div></div>`}
          <p class="muted">${isMock
            ? `依正式規格：${EXAM_SPEC[[...opt.subjects][0]].count} 題、${EXAM_SPEC[[...opt.subjects][0]].minutes} 分鐘，交卷後才公布答案與解析。參考及格線 ${PASS_LINE} 分（實際標準以當年簡章為準）。`
            : `符合條件的題目共 ${pool.length} 題，每答一題就會顯示對錯與解析。`}</p>
          <button class="btn primary block" id="startBtn" ${pool.length ? '' : 'disabled'}>${isMock ? '開始考試' : '開始練習'}</button>
        </div>`;
      $app.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
        const s = b.dataset.s;
        if (isMock) opt.subjects = new Set([s]);
        else { opt.subjects.has(s) ? opt.subjects.delete(s) : opt.subjects.add(s); }
        draw();
      });
      $app.querySelectorAll('[data-y]').forEach((b) => b.onclick = () => { opt.year = b.dataset.y === 'all' ? 'all' : +b.dataset.y; draw(); });
      $app.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => { opt.count = +b.dataset.n; draw(); });
      $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { opt.filter = b.dataset.f; draw(); });
      $app.querySelector('#startBtn').onclick = () => {
        const p = buildPool(opt, isMock);
        if (isMock) {
          const s = [...opt.subjects][0];
          const ids = p.sort((a, b) => QMAP[a].n - QMAP[b].n);
          startSession({ mode: 'mock', ids, label: `${opt.year} 年 ${subjName(s)}`, subject: s, limitSec: EXAM_SPEC[s].minutes * 60 });
        } else {
          startSession({ mode: 'practice', ids: orderWithPassages(shuffle(p)).slice(0, opt.count), label: `隨機練習 ${Math.min(opt.count, p.length)} 題` });
        }
      };
    };
    draw();
  }

  function buildPool(opt, isMock) {
    return BANK.questions.filter((q) => {
      if (!opt.subjects.has(q.s)) return false;
      if (opt.year !== 'all' && q.y !== opt.year) return false;
      if (isMock) return true;
      const r = state.rec[q.id];
      if (opt.filter === 'new') return !r;
      if (opt.filter === 'weak') return r && r.w > 0;
      return true;
    }).map((q) => q.id);
  }
  // 同一篇閱讀的題目排在一起
  function orderWithPassages(ids) {
    const out = [], seen = new Set();
    ids.forEach((id) => {
      if (seen.has(id)) return;
      const p = QMAP[id].p;
      const group = p ? ids.filter((x) => QMAP[x].p === p).sort((a, b) => QMAP[a].n - QMAP[b].n) : [id];
      group.forEach((x) => { seen.add(x); out.push(x); });
    });
    return out;
  }

  function startSession(s) {
    session = Object.assign({ idx: 0, answers: {}, startTs: Date.now(), finished: false }, s);
    state.session = session; saveState();
    go('#/quiz');
  }

  /* ---------- 作答畫面 ---------- */
  function quiz() {
    if (!session) session = state.session;
    if (!session || !session.ids || !session.ids.length) return go('#/home');
    const isMock = session.mode === 'mock';
    $title.textContent = session.label;
    if (isMock && !session.finished) startTimer();

    const id = session.ids[session.idx];
    const q = QMAP[id];
    if (!q) { session.idx = 0; return go('#/home'); }
    const chosen = session.answers[id];
    const reveal = !isMock && chosen != null;
    const total = session.ids.length;
    const answered = Object.keys(session.answers).length;

    const optHtml = q.o.map((text, i) => {
      const L = LETTERS[i];
      let cls = 'opt';
      if (reveal) { if (q.a.includes(L)) cls += ' right'; else if (chosen === L) cls += ' wrong'; }
      else if (chosen === L) cls += ' sel';
      return `<button class="${cls}" data-l="${L}" ${reveal ? 'disabled' : ''}><span class="k">${L}</span><span class="v">${esc(text)}</span></button>`;
    }).join('');

    let verdict = '';
    if (reveal) {
      const ok = isCorrect(q, chosen);
      verdict = `<div class="verdict ${ok ? 'ok' : 'bad'}">
        <h3>${q.a.length === 4 ? '官方公告本題一律給分' : ok ? (q.a.length > 1 ? `答對了！（官方公告 ${q.a.join('、')} 都給分）` : '答對了！') : `答錯了：你選 ${chosen}，正確答案是 ${q.a.join('、')}`}</h3>
        <p>${esc(q.e || '（這題的解析還在整理中）')}</p>
        ${q.r ? '<div class="review-note">⚠ 待查核：這題的解析依官方答案撰寫，相關法規數字請以最新版本為準。</div>' : ''}
      </div>${grammarBox(q)}`;
    }

    const passage = q.p ? renderPassage(q.p, !(isMock && !session.finished)) : '';

    $app.innerHTML = `
      <div class="progress"><i style="width:${pct(isMock ? answered : session.idx + (reveal ? 1 : 0), total)}%"></i></div>
      <div class="qmeta">
        <span>第 ${session.idx + 1} / ${total} 題</span>
        <span>${q.y} 年・${esc(subjName(q.s))}・第 ${q.n} 題</span>
        ${q.t ? `<span class="tag">${esc(q.t)}</span>` : ''}
        ${q.r && reveal ? '<span class="tag warn">待查核</span>' : ''}
      </div>
      ${passage}
      <p class="stem">${fmtStem(q.q)}</p>
      <div class="opts">${optHtml}</div>
      ${verdict}
      <div class="qnav">
        <button class="btn" id="prevBtn" ${session.idx === 0 ? 'disabled' : ''}>上一題</button>
        ${isMock
          ? (session.idx === total - 1 ? `<button class="btn primary" id="submitBtn">交卷</button>` : `<button class="btn primary" id="nextBtn">下一題</button>`)
          : `<button class="btn primary" id="nextBtn" ${reveal ? '' : 'disabled'}>${session.idx === total - 1 ? '看結果' : '下一題'}</button>`}
      </div>
      ${isMock ? `<div class="card"><h2>答題卡（已答 ${answered} / ${total}）</h2><div class="grid-nums">${session.ids.map((x, i) => `<button data-j="${i}" class="${session.answers[x] ? 'done' : ''} ${i === session.idx ? 'cur' : ''}">${i + 1}</button>`).join('')}</div>
        <button class="btn block" id="submitAll" style="margin-top:12px">提前交卷</button></div>` : ''}
      <div class="kbd-hint">鍵盤：A–D 或 1–4 作答，Enter／→ 下一題，← 上一題</div>`;

    $app.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => answer(b.dataset.l)));
    $app.querySelector('#prevBtn').onclick = () => move(-1);
    const nb = $app.querySelector('#nextBtn'); if (nb) nb.onclick = () => move(1);
    const sb = $app.querySelector('#submitBtn'); if (sb) sb.onclick = () => submitMock();
    const sa = $app.querySelector('#submitAll'); if (sa) sa.onclick = () => submitMock();
    $app.querySelectorAll('[data-j]').forEach((b) => b.onclick = () => { session.idx = +b.dataset.j; persist(); quiz(); });
    if (reveal) $app.querySelector('.verdict')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function answer(L) {
    const id = session.ids[session.idx];
    const q = QMAP[id];
    if (session.mode === 'mock') {
      session.answers[id] = L; persist(); quiz();
      return;
    }
    if (session.answers[id] != null) return;
    session.answers[id] = L;
    record(q, L);
    persist(); quiz();
  }
  function move(d) {
    const isMock = session.mode === 'mock';
    const n = session.idx + d;
    if (n < 0) return;
    if (n >= session.ids.length) {
      if (!isMock) { session.finished = true; persist(); go('#/result'); }
      return;
    }
    session.idx = n; persist(); quiz();
  }
  function persist() { state.session = session; saveState(); }

  function startTimer() {
    if (timerId) return; // 已在計時中（換題時不要重複開計時器）
    const tick = () => {
      if (!session || session.mode !== 'mock' || session.finished || !location.hash.startsWith('#/quiz')) {
        clearInterval(timerId); timerId = null; $topRight.textContent = ''; return;
      }
      const left = session.limitSec - Math.floor((Date.now() - session.startTs) / 1000);
      if (left <= 0) { clearInterval(timerId); timerId = null; toast('時間到，自動交卷'); submitMock(true); return; }
      const m = Math.floor(left / 60), s = left % 60;
      $topRight.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
    };
    tick(); timerId = setInterval(tick, 1000);
  }

  function submitMock(auto) {
    const unanswered = session.ids.filter((id) => !session.answers[id]).length;
    if (!auto && unanswered && !confirm(`還有 ${unanswered} 題沒作答，確定交卷？`)) return;
    clearInterval(timerId); timerId = null;
    session.ids.forEach((id) => { const L = session.answers[id]; if (L) record(QMAP[id], L); });
    const correct = session.ids.filter((id) => session.answers[id] && isCorrect(QMAP[id], session.answers[id])).length;
    const score = Math.round((correct / session.ids.length) * 1000) / 10;
    session.finished = true;
    session.score = score;
    session.usedSec = Math.min(session.limitSec, Math.floor((Date.now() - session.startTs) / 1000));
    state.exams.unshift({ ts: Date.now(), label: session.label, s: session.subject, score, correct, total: session.ids.length, usedSec: session.usedSec });
    state.exams = state.exams.slice(0, 50);
    persist();
    go('#/result');
  }

  /* ---------- 結果 ---------- */
  function result() {
    if (!session) session = state.session;
    if (!session) return go('#/home');
    $title.textContent = '結果';
    const ids = session.ids;
    const ok = ids.filter((id) => session.answers[id] && isCorrect(QMAP[id], session.answers[id]));
    const isMock = session.mode === 'mock';
    const score = isMock ? session.score : pct(ok.length, ids.length);
    const pass = score >= PASS_LINE;
    const wrongList = ids.filter((id) => !ok.includes(id));
    $app.innerHTML = `
      <div class="card score ${pass ? 'pass' : 'fail'}">
        <div class="big">${score}${isMock ? '' : '%'}</div>
        <div class="muted">${isMock ? `${session.label}・答對 ${ok.length} / ${ids.length} 題・用時 ${Math.floor(session.usedSec / 60)} 分 ${session.usedSec % 60} 秒` : `答對 ${ok.length} / ${ids.length} 題`}</div>
        ${isMock ? `<p><strong>${pass ? '達到參考及格線 🎉' : `距離參考及格線 ${PASS_LINE} 分還差 ${Math.round((PASS_LINE - score) * 10) / 10} 分`}</strong></p>` : ''}
      </div>
      <div class="row" style="margin-bottom:14px">
        ${wrongList.length ? `<button class="btn primary" id="redoWrong" style="flex:1">重做這次錯的 ${wrongList.length} 題</button>` : ''}
        <button class="btn" data-go="#/home" style="flex:1">回首頁</button>
      </div>
      <div class="card"><h2>${isMock ? '逐題檢討' : '本次題目'}</h2>
        <div class="grid-nums" style="margin-bottom:12px">${ids.map((id, i) => `<button data-j="${i}" class="${ok.includes(id) ? 'ok' : 'bad'}">${i + 1}</button>`).join('')}</div>
        <div id="reviewBox" class="muted">點上面的題號看詳解。</div>
      </div>`;
    bindGo();
    const box = $app.querySelector('#reviewBox');
    $app.querySelectorAll('[data-j]').forEach((b) => b.onclick = () => {
      const id = ids[+b.dataset.j], q = QMAP[id], ch = session.answers[id];
      box.className = '';
      box.innerHTML = `<div class="qmeta"><span>${q.y} 年・${esc(subjName(q.s))}・第 ${q.n} 題</span>${q.t ? `<span class="tag">${esc(q.t)}</span>` : ''}</div>
        <p class="stem">${fmtStem(q.q)}</p>
        <div class="opts">${q.o.map((t, i) => { const L = LETTERS[i]; const cls = q.a.includes(L) ? 'right' : (ch === L ? 'wrong' : ''); return `<button class="opt ${cls}" disabled><span class="k">${L}</span><span class="v">${esc(t)}</span></button>`; }).join('')}</div>
        <div class="verdict ${isCorrect(q, ch) ? 'ok' : 'bad'}"><h3>${ch ? (isCorrect(q, ch) ? '答對' : `你選 ${ch}，正確答案 ${q.a.join('、')}`) : `未作答，正確答案 ${q.a.join('、')}`}</h3><p>${esc(q.e)}</p>${q.r ? '<div class="review-note">⚠ 待查核：解析依官方答案撰寫，相關法規數字請以最新版本為準。</div>' : ''}</div>${grammarBox(q)}`;
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const rw = $app.querySelector('#redoWrong');
    if (rw) rw.onclick = () => startSession({ mode: 'practice', ids: wrongList, label: `重做錯題 ${wrongList.length} 題` });
  }

  /* ---------- 錯題本 ---------- */
  function wrong() {
    $title.textContent = '錯題本';
    const ids = wrongIds();
    const bySubj = SUBJECT_ORDER.map((s) => ({ s, ids: ids.filter((id) => QMAP[id].s === s) })).filter((g) => g.ids.length);
    $app.innerHTML = ids.length ? `
      <div class="card"><p style="margin-top:0">答錯的題目會收進這裡，之後<strong>連續答對 2 次</strong>就會自動移出。</p>
        <button class="btn primary block" id="allBtn">全部錯題練習（${ids.length} 題）</button></div>
      ${bySubj.map((g) => `<div class="card"><div class="row"><h2 class="spacer" style="margin:0">${esc(subjName(g.s))}（${g.ids.length}）</h2><button class="btn" data-s="${g.s}">練這科</button></div>
        ${g.ids.slice(0, 50).map((id) => { const q = QMAP[id], r = state.rec[id]; return `<div class="list-item"><div class="muted">${q.y} 年第 ${q.n} 題・錯 ${r.w} 次${q.t ? '・' + esc(q.t) : ''}</div><div>${fmtStem(q.q.length > 70 ? q.q.slice(0, 70) + '…' : q.q)}</div></div>`; }).join('')}
      </div>`).join('')}`
      : `<div class="card empty">目前沒有錯題 👍<br>去做幾題練習吧！<br><br><button class="btn primary" data-go="#/setup/practice">開始練習</button></div>`;
    bindGo();
    $app.querySelector('#allBtn')?.addEventListener('click', () => startSession({ mode: 'practice', ids: orderWithPassages(shuffle(ids)), label: `錯題練習 ${ids.length} 題` }));
    $app.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
      const sub = ids.filter((id) => QMAP[id].s === b.dataset.s);
      startSession({ mode: 'practice', ids: orderWithPassages(shuffle(sub)), label: `${subjName(b.dataset.s)} 錯題 ${sub.length} 題` });
    });
  }

  /* ---------- 弱點分析 ---------- */
  function stats() {
    $title.textContent = '弱點分析';
    const tags = {};
    BANK.questions.forEach((q) => {
      const r = state.rec[q.id]; if (!r) return;
      const k = `${q.s}|${q.t || '未分類'}`;
      tags[k] = tags[k] || { s: q.s, t: q.t || '未分類', c: 0, w: 0, ids: [] };
      tags[k].c += r.c; tags[k].w += r.w; tags[k].ids.push(q.id);
    });
    const list = Object.values(tags).filter((x) => x.c + x.w >= 3).sort((a, b) => pct(a.c, a.c + a.w) - pct(b.c, b.c + b.w));
    $app.innerHTML = `
      <div class="card"><h2>各科答對率</h2>
        ${SUBJECT_ORDER.map((s) => { const st = subjectStats(s); return `<div class="subj"><div class="name">${esc(subjName(s))}<div class="bar"><i style="width:${st.acc}%"></i></div><div class="muted">作答 ${st.attempts} 次</div></div><div class="pct">${st.attempts ? st.acc + '%' : '—'}</div></div>`; }).join('')}
      </div>
      <div class="card"><h2>最需要加強的主題</h2>
        ${list.length ? list.slice(0, 12).map((x, i) => `<div class="subj"><div class="name">${esc(x.t)}<div class="muted">${esc(subjName(x.s))}・作答 ${x.c + x.w} 次</div><div class="bar"><i style="width:${pct(x.c, x.c + x.w)}%;background:${pct(x.c, x.c + x.w) < 60 ? 'var(--bad)' : 'var(--brand)'}"></i></div></div><div class="pct">${pct(x.c, x.c + x.w)}%</div><button class="btn" data-k="${i}">練習</button></div>`).join('')
          : '<p class="muted">同一主題作答滿 3 次後，這裡會列出答對率最低的主題。</p>'}
      </div>
      <div class="card"><h2>模擬考紀錄</h2>
        ${state.exams.length ? state.exams.slice(0, 10).map((e) => `<div class="list-item row"><div class="spacer">${esc(e.label)}<div class="muted">${new Date(e.ts).toLocaleString('zh-TW', { hour12: false })}・答對 ${e.correct}/${e.total}</div></div><strong style="color:${e.score >= PASS_LINE ? 'var(--ok)' : 'var(--bad)'}">${e.score} 分</strong></div>`).join('') : '<p class="muted">還沒有模擬考紀錄。</p>'}
      </div>
      <div class="card"><h2>資料管理</h2>
        <p class="muted" style="margin-top:0">作答紀錄只存在這台裝置的瀏覽器裡。換裝置可以先匯出、再到另一台匯入。</p>
        <div class="row"><button class="btn" id="exportBtn">匯出紀錄</button><button class="btn" id="importBtn">匯入紀錄</button><input type="file" id="importFile" accept=".json,application/json" hidden></div>
      </div>`;
    $app.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      const x = list[+b.dataset.k];
      const all = BANK.questions.filter((q) => q.s === x.s && (q.t || '未分類') === x.t).map((q) => q.id);
      startSession({ mode: 'practice', ids: orderWithPassages(shuffle(all)).slice(0, 20), label: `主題練習：${x.t}` });
    });
    $app.querySelector('#exportBtn').onclick = () => {
      const blob = new Blob([JSON.stringify({ app: 'p11-tourleader', exported: new Date().toISOString(), state }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `領隊練習紀錄-${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    const fi = $app.querySelector('#importFile');
    $app.querySelector('#importBtn').onclick = () => fi.click();
    fi.onchange = async () => {
      try {
        const d = JSON.parse(await fi.files[0].text());
        if (d.app !== 'p11-tourleader' || !d.state) throw new Error('格式不符');
        if (!confirm('匯入會覆蓋這台裝置目前的紀錄，確定嗎？')) return;
        state = Object.assign(loadState(), d.state); saveState(); toast('已匯入'); stats();
      } catch (e) { alert('匯入失敗：' + e.message); }
    };
  }

  /* ---------- 瀏覽題目 ---------- */
  function browse(arg) {
    $title.textContent = '瀏覽題目';
    const s = SUBJECT_ORDER.includes(arg) ? arg : 'practice';
    const qs = BANK.questions.filter((q) => q.s === s).sort((a, b) => b.y - a.y || a.n - b.n);
    $app.innerHTML = `
      <div class="chips" style="margin-bottom:14px">${SUBJECT_ORDER.map((x) => `<button class="chip" data-go="#/browse/${x}" aria-pressed="${x === s}">${esc(subjName(x))}</button>`).join('')}</div>
      <div class="card">${qs.map((q) => `<details class="list-item"><summary>${q.y}-${q.n}. ${fmtStem(q.q.length > 60 ? q.q.slice(0, 60) + '…' : q.q)}</summary>
        <p class="stem" style="font-size:16px;margin-top:10px">${fmtStem(q.q)}</p>
        <ol type="A" style="margin:0 0 8px;padding-left:22px">${q.o.map((o, i) => `<li style="${q.a.includes(LETTERS[i]) ? 'color:var(--ok);font-weight:600' : ''}">${esc(o)}</li>`).join('')}</ol>
        <p class="muted" style="margin:0">${esc(q.e)}</p></details>`).join('')}</div>`;
    bindGo();
  }

  /* ---------- 鍵盤 ---------- */
  document.addEventListener('keydown', (e) => {
    if (!location.hash.startsWith('#/quiz') || !session || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toUpperCase();
    const map = { A: 'A', B: 'B', C: 'C', D: 'D', 1: 'A', 2: 'B', 3: 'C', 4: 'D' };
    if (map[k]) { answer(map[k]); e.preventDefault(); }
    else if (k === 'ENTER' || k === 'ARROWRIGHT') {
      const nb = document.getElementById('nextBtn'); if (nb && !nb.disabled) { nb.click(); e.preventDefault(); }
    } else if (k === 'ARROWLEFT') { const pb = document.getElementById('prevBtn'); if (pb && !pb.disabled) pb.click(); }
  });

  /* ---------- 啟動 ---------- */
  fetch('data/bank.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((b) => {
      BANK = b;
      b.questions.forEach((q) => { QMAP[q.id] = q; });
      if (state.session && state.session.ids) state.session.ids = state.session.ids.filter((id) => QMAP[id]);
      render();
    })
    .catch((e) => { $app.innerHTML = `<div class="card empty">題庫載入失敗（${esc(e.message)}）。<br>請確認網路後重新整理。</div>`; });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

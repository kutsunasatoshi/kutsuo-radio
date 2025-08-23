// app.js（統合フィルタ + デバウンス + 病原体ピル非表示）
// - 一覧は data/index.json（軽量）
// - 詳細は details.html?slug=... で ep/<slug>.json を1件取得
// - 感染症の種類は infection_all を使用（病原体も統合済み）
// - 外部リンク（再生ボタン）は x.url をそのまま使用（Creatorsでも可）

let items = [];
const $  = (s) => document.querySelector(s);

/* ============================== 起動 ============================== */
async function load() {
  try {
    const res = await fetch('data/index.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} when fetching index.json`);
    items = await res.json();
    if (!Array.isArray(items)) throw new Error('index.json is not an array');
    initFilters(items);
    wireUI();
    render();
  } catch (e) {
    $('#list').innerHTML = `<div class="warn">読み込みエラー：${escapeHtml(e.message)}</div>`;
    $('#count').textContent = '0件ヒット（読み込みエラー）';
  }
}

/* ============================== UI配線 ============================== */
function wireUI(){
  $('#toggle-filters')?.addEventListener('click', ()=>{
    const d = $('#filters'); if(!d) return; d.open = !d.open;
  });
  $('#reset')?.addEventListener('click', resetAll);

  // ショートカット：/ で検索にフォーカス、Esc で解除
  window.addEventListener('keydown', (e)=>{
    if(e.key==='/' && document.activeElement.tagName!=='INPUT'){ e.preventDefault(); $('#q')?.focus(); }
    if(e.key==='Escape'){ document.activeElement.blur(); }
  });
}

/* ============================== フィルタ初期化（デバウンス入り） ============================== */
function initFilters(data) {
  // 統合：infection_all からユニーク抽出（保険として古い構造にも対応）
  const allInfections = uniq(
    data.flatMap(d => (d.infection_all && d.infection_all.length)
        ? d.infection_all : [d.infection_type, ...(d.pathogens||[])])
      .filter(Boolean)
  );
  fillSelect('#f-infection', allInfections);
  fillSelect('#f-journal',   uniq(data.map(d => d.journal).filter(Boolean)));
  fillSelect('#f-design',    uniq(data.map(d => d.study_design)));
  fillSelect('#f-topic',     uniq(data.flatMap(d => d.topics||[])));
  fillSelect('#f-tag',       uniq(data.flatMap(d => d.tags||[])));

  // デバウンス（150ms）
  const debounce = (fn, ms = 150) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const handler = debounce(render, 150);

  ['#q','#f-infection','#f-journal','#f-design','#f-topic','#f-tag','#sort'].forEach(sel=>{
    const el = $(sel); if (!el) return;
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
}

/* ============================== 共通UIヘルパ ============================== */
function fillSelect(sel, values) {
  const el = $(sel); if (!el) return;
  el.innerHTML = '<option value="">すべて</option>';
  const sorted = [...values].sort((a,b)=>String(a).localeCompare(String(b),'ja'));
  for (const v of sorted) {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  }
}

function getState(){
  return {
    q:  ($('#q')?.value || '').replace(/\u3000/g,' ').trim(),
    fi: $('#f-infection')?.value || '',
    fj: $('#f-journal')?.value   || '',
    fd: $('#f-design')?.value    || '',
    ft: $('#f-topic')?.value     || '',
    fg: $('#f-tag')?.value       || '',
    sort: $('#sort')?.value      || 'new',
  };
}

/* ============================== 強化検索（AND/OR/"..."/-除外） ============================== */
function parseQuery(qRaw){
  const q = (qRaw || '').trim();
  if (!q) return { includeGroups: [], exclude: [], highlight: [] };
  const phrases = [];
  let rest = q.replace(/"([^"]+)"/g, (_, p) => { phrases.push(p.trim()); return ' '; });
  const tokens = rest.split(/\s+/).filter(Boolean);
  const includeGroups = []; const exclude = [];
  for (const ph of phrases) includeGroups.push([ph]);
  for (const t of tokens) {
    if (t.startsWith('-') && t.length>1) { exclude.push(t.slice(1)); continue; }
    const orGroup = t.split('|').map(s=>s.trim()).filter(Boolean);
    if (orGroup.length) includeGroups.push(orGroup);
  }
  const highlight = [...phrases, ...includeGroups.flatMap(g=>g)].filter(Boolean);
  return { includeGroups, exclude, highlight };
}

function recordText(x){
  const parts = [
    x.title || '',
    x.summary_short || '',
    x.journal || '',
    x.infection_type || '',
    ...(x.infection_all || []),
    x.study_design || '',
    ...(x.topics || []),
    ...(x.tags || [])
  ];
  return parts.join('\n').toLowerCase();
}

function buildPredicate(qRaw){
  const { includeGroups, exclude } = parseQuery(qRaw);
  if (includeGroups.length===0 && exclude.length===0) return ()=>true;
  return (x) => {
    const text = recordText(x);
    for (const orGroup of includeGroups){
      let ok=false;
      for (const term of orGroup){
        if (term && text.includes(term.toLowerCase())) { ok=true; break; }
      }
      if (!ok) return false;
    }
    for (const ex of exclude){
      if (ex && text.includes(ex.toLowerCase())) return false;
    }
    return true;
  };
}

function getHighlightTerms(state){
  const parsed = parseQuery(state.q);
  const extra = [state.fi,state.fj,state.fd,state.ft,state.fg].filter(Boolean);
  return [...new Set([...parsed.highlight, ...extra])].sort((a,b)=>b.length-a.length);
}

/* ============================== 描画 ============================== */
function render() {
  const s = getState();
  const predicate = buildPredicate(s.q);

  let list = items.filter(x =>
    predicate(x) &&
    (!s.fi || includesInfection(x, s.fi)) &&
    (!s.fj || (x.journal || '') === s.fj) &&
    (!s.fd || (x.study_design || '') === s.fd) &&
    (!s.ft || (x.topics || []).includes(s.ft)) &&
    (!s.fg || (x.tags   || []).includes(s.fg))
  );

  if (s.sort === 'title')      list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
  else if (s.sort === 'journal') list.sort((a, b) => (a.journal || '').localeCompare(b.journal || '', 'ja'));
  else                          list.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

  // 共有用URL同期（不要ならコメントアウト可）
  const qs = new URLSearchParams(s).toString();
  history.replaceState(null, "", "?" + qs);

  $('#count').textContent = `${list.length}件ヒット`;

  const terms = getHighlightTerms(s);
  $('#list').innerHTML = list.length
    ? list.map(row => card(row, terms, s)).join('')
    : '<p>該当なし（クエリやフィルタ条件をご確認ください）</p>';

  // 先読み（ホバーで詳細JSONをキャッシュ）
  document.querySelectorAll('.card a[href*="details.html"]').forEach(a=>{
    a.addEventListener('mouseenter', ()=>{
      const m = a.href.match(/slug=([^&]+)/); if(!m) return;
      const slug = decodeURIComponent(m[1]);
      const base = location.origin + location.pathname.replace(/\/[^\/]*$/, '/');
      fetch(base + `data/ep/${slug}.json`, {cache:'force-cache'});
    }, {once:true});
  });
}

function includesInfection(x, val){
  const arr = (x.infection_all && x.infection_all.length)
              ? x.infection_all : [x.infection_type, ...(x.pathogens||[])];
  return (arr || []).includes(val);
}

/* ============================== その他 ============================== */
function resetAll(){
  ['#q','#f-infection','#f-journal','#f-design','#f-topic','#f-tag']
    .forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('#sort').value = 'new';
  render();
}

function card(x, terms, state) {
  const d = x.pubDate ? new Date(x.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';

  // ★病原体ピルは非表示：pathogensは作らない
  const topics = (x.topics || []).map(t => `<span class="pill pill-green">${escapeHtml(t)}</span>`).join('');
  const tags   = (x.tags   || []).map(t => `<span class="pill pill-purple">#${escapeHtml(t)}</span>`).join('');

  const qs = new URLSearchParams({
    slug: String(x.slug),
    q: state.q || '', fi: state.fi || '', fj: state.fj || '', fd: state.fd || '',
    ft: state.ft || '', fg: state.fg || ''
  }).toString();
  const detailUrl = `details.html?${qs}`;

  const sum = x.summary_short || '';
  const titleHL   = highlight(x.title || '', terms);
  const summaryHL = highlightWithNewline(sum, terms);

  const playUrl = x.url || ''; // CreatorsでもOK

  return `
  <article class="card">
    <h3><a href="${detailUrl}">${titleHL}</a></h3>
    <div class="meta">
      <span class="tag">${escapeHtml(x.infection_type || 'その他')}</span>
      <span class="tag">${escapeHtml(x.journal || '誌名不明')}</span>
      <span class="tag">${escapeHtml(x.study_design || '不明')}</span>
      ${topics}${tags}
      <span class="date">${dateStr}</span>
    </div>
    ${sum ? `<p class="summary summary-preline">${summaryHL}</p>` : ''}
    ${playUrl ? `<div style="margin-top:8px"><a class="btn btn-primary" href="${escapeAttr(playUrl)}" target="_blank" rel="noopener">▶ 詳細／再生へ</a></div>` : ''}
  </article>`;
}

/* ============================== ユーティリティ ============================== */
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeAttr(s){return String(s).replace(/"/g,'&quot;')}
function uniq(arr){return [...new Set((arr||[]).filter(Boolean))]}
function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}
function highlight(text, terms){
  let html = escapeHtml(String(text||'')); for (const t of terms){ if (t) html = html.replace(new RegExp(escapeRegExp(t),'gi'), m=>`<mark>${m}</mark>`); }
  return html;
}
function highlightWithNewline(text, terms){
  let html = escapeHtml(String(text||'')).replace(/\n/g,'<br>'); for (const t of terms){ if (t) html = html.replace(new RegExp(escapeRegExp(t),'gi'), m=>`<mark>${m}</mark>`); }
  return html;
}

/* ============================== 実行 ============================== */
load();

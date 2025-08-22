// app.js（強化検索版：タイトル/要旨/誌名/カテゴリ/病原体/トピック/タグを横断）
// サポート：AND（スペース）, OR（|）, 除外（-語）, フレーズ検索（"..."）
// 既存のフィルタ・並び替え・件数・詳細ページ・ハイライトを維持

let items = [];
const $  = (s) => document.querySelector(s);

async function load() {
  try {
    const res = await fetch('data/episodes.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} when fetching episodes.json`);
    items = await res.json();
    if (!Array.isArray(items)) throw new Error('episodes.json is not an array');
    initFilters(items);
    wireUI();
    render();
  } catch (e) {
    $('#list').innerHTML = `<div class="warn">読み込みエラー：${escapeHtml(e.message)}</div>`;
    $('#count').textContent = '0件ヒット（読み込みエラー）';
  }
}

function wireUI(){
  $('#toggle-filters')?.addEventListener('click', ()=>{
    const d = $('#filters'); if(!d) return; d.open = !d.open;
  });
  $('#reset')?.addEventListener('click', resetAll);
}

function initFilters(data) {
  fillSelect('#f-infection', uniq(data.map(d => d.infection_type)));
  fillSelect('#f-journal',   uniq(data.map(d => d.journal).filter(Boolean)));
  fillSelect('#f-design',    uniq(data.map(d => d.study_design)));
  fillSelect('#f-pathogen',  uniq(data.flatMap(d => d.pathogens || [])));
  fillSelect('#f-topic',     uniq(data.flatMap(d => d.topics    || [])));
  fillSelect('#f-tag',       uniq(data.flatMap(d => d.tags      || [])));

  ['#q','#f-infection','#f-journal','#f-design',
   '#f-pathogen','#f-topic','#f-tag','#sort'
  ].forEach(id => $(id)?.addEventListener('input', render));
}

function fillSelect(sel, values) {
  const el = $(sel); if (!el) return;
  const sorted = [...values].sort((a,b)=>String(a).localeCompare(String(b),'ja'));
  for (const v of sorted) {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  }
}

function getState(){
  return {
    q:  ($('#q')?.value || '').replace(/\u3000/g,' ').trim(), // 全角空白→半角
    fi: $('#f-infection')?.value || '',
    fj: $('#f-journal')?.value   || '',
    fd: $('#f-design')?.value    || '',
    fp: $('#f-pathogen')?.value  || '',
    ft: $('#f-topic')?.value     || '',
    fg: $('#f-tag')?.value       || '',
    sort: $('#sort')?.value      || 'new',
  };
}

/* ===================== 強化検索ロジック ===================== */
// クエリを解析して { includeGroups: [[term|phrase]...], exclude: [...], highlight: [...] } を返す
function parseQuery(qRaw){
  const q = (qRaw || '').trim();
  if (!q) return { includeGroups: [], exclude: [], highlight: [] };

  // フレーズ "..." を先に抜き出す
  const phrases = [];
  let rest = q.replace(/"([^"]+)"/g, (_, p) => { phrases.push(p.trim()); return ' '; });

  // 残りを空白で分割しつつ OR（|）対応
  const tokens = rest.split(/\s+/).filter(Boolean);
  const includeGroups = []; // AND の各要素。各要素は OR の配列
  const exclude = [];

  // まずフレーズを AND 条件に追加
  for (const ph of phrases) includeGroups.push([ph]);

  for (const t of tokens) {
    if (t.startsWith('-') && t.length > 1) { // 除外
      exclude.push(t.slice(1));
      continue;
    }
    // OR（|）で分割
    const orGroup = t.split('|').map(s => s.trim()).filter(Boolean);
    if (orGroup.length) includeGroups.push(orGroup);
  }

  // ハイライト用語：すべての包含語（ORの各要素）とフレーズ、除外語は除く
  const highlight = [
    ...phrases,
    ...includeGroups.flatMap(g => g)
  ].filter(Boolean);

  return { includeGroups, exclude, highlight };
}

// レコードを正規化して連結（検索対象フィールドをまとめて1本のテキストに）
function recordText(x){
  const parts = [
    x.title || '',
    x.summary || '',
    x.journal || '',
    x.infection_type || '',
    x.study_design || '',
    ...(x.pathogens || []),
    ...(x.topics || []),
    ...(x.tags || [])
  ];
  return parts.join('\n').toLowerCase();
}

// includeGroups / exclude でマッチ判定
function buildPredicate(qRaw){
  const { includeGroups, exclude } = parseQuery(qRaw);
  if (includeGroups.length === 0 && exclude.length === 0) {
    return () => true; // クエリ空なら無条件で通す
  }
  return (x) => {
    const text = recordText(x);
    // AND 各群：群の中のいずれか（OR）が含まれていること
    for (const orGroup of includeGroups) {
      let ok = false;
      for (const term of orGroup) {
        if (!term) continue;
        if (text.includes(term.toLowerCase())) { ok = true; break; }
      }
      if (!ok) return false;
    }
    // 除外語は含まれていないこと
    for (const ex of exclude) {
      if (ex && text.includes(ex.toLowerCase())) return false;
    }
    return true;
  };
}

function getHighlightTerms(state){
  const parsed = parseQuery(state.q);
  // フィルタで選ばれている語もハイライト対象に足す
  const extra = [state.fi, state.fj, state.fd, state.fp, state.ft, state.fg].filter(Boolean);
  const terms = [...parsed.highlight, ...extra];
  // 重複除去＆長い語優先
  return [...new Set(terms)].sort((a,b)=>b.length - a.length);
}
/* =========================================================== */

function render() {
  const s = getState();
  const predicate = buildPredicate(s.q);

  let list = items.filter(x =>
    predicate(x) &&
    (!s.fi || (x.infection_type || '') === s.fi) &&
    (!s.fj || (x.journal || '') === s.fj) &&
    (!s.fd || (x.study_design || '') === s.fd) &&
    (!s.fp || (x.pathogens || []).includes(s.fp)) &&
    (!s.ft || (x.topics    || []).includes(s.ft)) &&
    (!s.fg || (x.tags      || []).includes(s.fg))
  );

  if (s.sort === 'title')      list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
  else if (s.sort === 'journal') list.sort((a, b) => (a.journal || '').localeCompare(b.journal || '', 'ja'));
  else                          list.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

  $('#count').textContent = `${list.length}件ヒット`;

  const terms = getHighlightTerms(s);
  $('#list').innerHTML = list.length
    ? list.map(row => card(row, terms, s)).join('')
    : '<p>該当なし（クエリやフィルタ条件をご確認ください）</p>';
}

function resetAll(){
  ['#q','#f-infection','#f-journal','#f-design','#f-pathogen','#f-topic','#f-tag']
    .forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('#sort').value = 'new';
  render();
}

function card(x, terms, state) {
  const d = x.pubDate ? new Date(x.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';
  const pathogens = (x.pathogens || []).map(p => `<span class="pill pill-blue">${escapeHtml(p)}</span>`).join('');
  const topics    = (x.topics    || []).map(t => `<span class="pill pill-green">${escapeHtml(t)}</span>`).join('');
  const tags      = (x.tags      || []).map(t => `<span class="pill pill-purple">#${escapeHtml(t)}</span>`).join('');

  // 詳細へ検索条件も引き継ぎ（ハイライト継続）
  const qs = new URLSearchParams({
    id: String(x.id),
    q: state.q || '',
    fi: state.fi || '', fj: state.fj || '', fd: state.fd || '',
    fp: state.fp || '', ft: state.ft || '', fg: state.fg || ''
  }).toString();
  const detailUrl = `details.html?${qs}`;

  const raw = x.summary || '';
  const sum = truncateLines(raw, 3, 220);
  const titleHL   = highlight(x.title || '', terms);
  const summaryHL = highlightWithNewline(sum, terms);

  return `
  <article class="card">
    <h3><a href="${detailUrl}">${titleHL}</a></h3>
    <div class="meta">
      <span class="tag">${escapeHtml(x.infection_type || 'その他')}</span>
      <span class="tag">${escapeHtml(x.journal || '誌名不明')}</span>
      <span class="tag">${escapeHtml(x.study_design || '不明')}</span>
      ${pathogens}${topics}${tags}
      <span class="date">${dateStr}</span>
    </div>
    ${sum ? `<p class="summary summary-preline">${summaryHL}</p>` : ''}
    ${x.url ? `<div style="margin-top:8px"><a class="btn btn-primary" href="${escapeAttr(x.url)}" target="_blank" rel="noopener">▶ 元記事／再生へ</a></div>` : ''}
  </article>`;
}

/* ---------- ユーティリティ ---------- */
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeAttr(s){return String(s).replace(/"/g,'&quot;')}
function uniq(arr){return [...new Set((arr||[]).filter(Boolean))]}

function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}
function highlight(text, terms){
  let html = escapeHtml(String(text||''));
  for (const t of terms) {
    if (!t) continue;
    html = html.replace(new RegExp(escapeRegExp(t), 'gi'), m => `<mark>${m}</mark>`);
  }
  return html;
}
function highlightWithNewline(text, terms){
  let html = escapeHtml(String(text||'')).replace(/\n/g,'<br>');
  for (const t of terms) {
    if (!t) continue;
    html = html.replace(new RegExp(escapeRegExp(t), 'gi'), m => `<mark>${m}</mark>`);
  }
  return html;
}
function truncateLines(s, maxLines=3, maxChars=220){
  const text = String(s || '').trim();
  if (!text) return '';
  const lines = text.split('\n');
  let clipped = lines.slice(0, maxLines).join('\n');
  if (clipped.length > maxChars) clipped = clipped.slice(0, maxChars-1) + '…';
  return clipped;
}

load();

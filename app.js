// app.js（要旨整形＋ハイライト版：全文）
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
    q:  ($('#q')?.value || '').trim(),
    fi: $('#f-infection')?.value || '',
    fj: $('#f-journal')?.value   || '',
    fd: $('#f-design')?.value    || '',
    fp: $('#f-pathogen')?.value  || '',
    ft: $('#f-topic')?.value     || '',
    fg: $('#f-tag')?.value       || '',
    sort: $('#sort')?.value      || 'new',
  };
}

function getHighlightTerms(s){
  const terms = [];
  if (s.q) terms.push(...s.q.split(/\s+/).filter(Boolean));
  [s.fi, s.fj, s.fd, s.fp, s.ft, s.fg].forEach(x => { if (x) terms.push(x); });
  return [...new Set(terms)].sort((a,b)=>b.length - a.length);
}

function render() {
  const s = getState();
  const qLower = s.q.toLowerCase();

  let list = items.filter(x =>
    (!qLower || (x.title || '').toLowerCase().includes(qLower) || (x.summary || '').toLowerCase().includes(qLower)) &&
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
    ? list.map(row => card(row, terms)).join('')
    : '<p>該当なし（episodes.jsonは空配列か、フィルタで絞り込み過ぎ）</p>';
}

function resetAll(){
  ['#q','#f-infection','#f-journal','#f-design','#f-pathogen','#f-topic','#f-tag']
    .forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('#sort').value = 'new';
  render();
}

function card(x, terms) {
  const d = x.pubDate ? new Date(x.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';
  const pathogens = (x.pathogens || []).map(p => `<span class="pill pill-blue">${escapeHtml(p)}</span>`).join('');
  const topics    = (x.topics    || []).map(t => `<span class="pill pill-green">${escapeHtml(t)}</span>`).join('');
  const tags      = (x.tags      || []).map(t => `<span class="pill pill-purple">#${escapeHtml(t)}</span>`).join('');

  const qs = new URLSearchParams(getState()).toString();
  const detailUrl = `details.html?id=${encodeURIComponent(String(x.id))}&${qs}`;

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

/* ハイライト・整形ユーティリティ */
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

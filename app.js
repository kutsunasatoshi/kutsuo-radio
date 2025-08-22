// app.js（詳細ページ対応版：全文）
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
    const el = $('#list');
    if (el) el.innerHTML = `<div class="warn">読み込みエラー：${escapeHtml(e.message)}</div>`;
    const c = $('#count'); if (c) c.textContent = '0件ヒット（読み込みエラー）';
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
    q:  ($('#q')?.value || '').trim().toLowerCase(),
    fi: $('#f-infection')?.value || '',
    fj: $('#f-journal')?.value   || '',
    fd: $('#f-design')?.value    || '',
    fp: $('#f-pathogen')?.value  || '',
    ft: $('#f-topic')?.value     || '',
    fg: $('#f-tag')?.value       || '',
    sort: $('#sort')?.value      || 'new',
  };
}

function render() {
  const s = getState();

  let list = items.filter(x =>
    (!s.q  || (x.title || '').toLowerCase().includes(s.q)) &&
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

  const container = $('#list');
  container.innerHTML = list.length
    ? list.map(row => card(row)).join('')
    : '<p>該当なし（episodes.jsonは空配列か、フィルタで絞り込み過ぎ）</p>';
}

function resetAll(){
  ['#q','#f-infection','#f-journal','#f-design','#f-pathogen','#f-topic','#f-tag']
    .forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('#sort').value = 'new';
  render();
}

function card(x) {
  const d = x.pubDate ? new Date(x.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';

  const pathogens = (x.pathogens || []).map(p => `<span class="pill pill-blue">${escapeHtml(p)}</span>`).join('');
  const topics    = (x.topics    || []).map(t => `<span class="pill pill-green">${escapeHtml(t)}</span>`).join('');
  const tags      = (x.tags      || []).map(t => `<span class="pill pill-purple">#${escapeHtml(t)}</span>`).join('');

  // 詳細ページURL（idをそのまま使う。URLに含めるためエンコード）
  const detailUrl = `details.html?id=${encodeURIComponent(String(x.id))}`;

  const raw = x.summary || '';
  const sum = truncateForCard(raw, 160);

  return `
  <article class="card">
    <h3><a href="${detailUrl}">${escapeHtml(x.title || '')}</a></h3>
    <div class="meta">
      <span class="tag">${escapeHtml(x.infection_type || 'その他')}</span>
      <span class="tag">${escapeHtml(x.journal || '誌名不明')}</span>
      <span class="tag">${escapeHtml(x.study_design || '不明')}</span>
      ${pathogens}${topics}${tags}
      <span class="date">${dateStr}</span>
    </div>
    ${sum ? `<p class="summary">${escapeHtml(sum)}</p>` : ''}
    ${x.url ? `<div style="margin-top:8px"><a class="btn btn-primary" href="${escapeAttr(x.url)}" target="_blank" rel="noopener">▶ 元記事／再生へ</a></div>` : ''}
  </article>`;
}

/* util */
function truncateForCard(s, n){ const str=String(s).trim(); return (str.length<=n)?str:str.slice(0,n-1)+'…'; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeAttr(s){return String(s).replace(/"/g,'&quot;')}
function uniq(arr){return [...new Set((arr||[]).filter(Boolean))]}

load();

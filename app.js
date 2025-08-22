// app.js（デバッグ耐性・見える化付き：全文）
let items = [];
const $  = (s) => document.querySelector(s);

async function load() {
  try {
    // キャッシュ破りも追加（?t=timestamp）
    const url = 'data/episodes.json?t=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} when fetching episodes.json`);
    const text = await res.text();

    // JSON妥当性チェック（壊れている場合に原因を画面表示）
    try {
      items = JSON.parse(text);
    } catch (e) {
      showFatal(
        'episodes.json のパースに失敗しました。',
        'JSONが壊れている可能性があります（Unexpected token など）。',
        e.message,
        text.slice(0, 300) + (text.length > 300 ? ' …' : '')
      );
      return;
    }

    if (!Array.isArray(items)) {
      showFatal('episodes.json が配列ではありません。', '最上位は [] の配列である必要があります。');
      return;
    }

    initFilters(items);
    wireUI();
    render();
  } catch (err) {
    showFatal('episodes.json の読み込みに失敗しました。', 'ファイルの場所・公開設定・パスをご確認ください。', String(err));
  }
}

function showFatal(title, hint = '', detail = '', snippet = '') {
  const el = document.getElementById('list');
  if (!el) return;
  el.innerHTML = `
    <div style="border:1px solid #e11d48;padding:12px;border-radius:10px;background:#fff0; color:#e11d48">
      <strong>${escapeHtml(title)}</strong><br>
      ${hint ? `<div style="color:#f43f5e;margin-top:4px">${escapeHtml(hint)}</div>` : ''}
      ${detail ? `<div style="color:#fb7185;margin-top:6px">詳細: ${escapeHtml(detail)}</div>` : ''}
      ${snippet ? `<pre style="white-space:pre-wrap;background:#111;color:#eee;padding:8px;border-radius:8px;overflow:auto;margin-top:8px">${escapeHtml(snippet)}</pre>` : ''}
    </div>`;
  const count = document.getElementById('count');
  if (count) count.textContent = '0件ヒット（読み込みエラー）';
}

function wireUI(){
  document.getElementById('toggle-filters')?.addEventListener('click', ()=>{
    const d = document.getElementById('filters'); if(!d) return; d.open = !d.open;
  });
  document.getElementById('reset')?.addEventListener('click', resetAll);
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
  ].forEach(id => document.querySelector(id)?.addEventListener('input', render));
}

function fillSelect(sel, values) {
  const el = document.querySelector(sel); if (!el) return;
  const sorted = [...values].sort((a,b)=>String(a).localeCompare(String(b),'ja'));
  for (const v of sorted) {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  }
}

function getState(){
  return {
    q:  (document.getElementById('q')?.value || '').trim().toLowerCase(),
    fi: document.getElementById('f-infection')?.value || '',
    fj: document.getElementById('f-journal')?.value   || '',
    fd: document.getElementById('f-design')?.value    || '',
    fp: document.getElementById('f-pathogen')?.value  || '',
    ft: document.getElementById('f-topic')?.value     || '',
    fg: document.getElementById('f-tag')?.value       || '',
    sort: document.getElementById('sort')?.value      || 'new',
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

  if (s.sort === 'title') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
  } else if (s.sort === 'journal') {
    list.sort((a, b) => (a.journal || '').localeCompare(b.journal || '', 'ja'));
  } else {
    list.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  }

  const count = document.getElementById('count');
  if (count) count.textContent = `${list.length}件ヒット`;

  const container = document.getElementById('list');
  container.innerHTML = list.length
    ? list.map(row => card(row)).join('')
    : '<p>該当なし（episodes.jsonは空配列か、フィルタで絞り込み過ぎかもしれません）</p>';
}

function resetAll(){
  ['#q','#f-infection','#f-journal','#f-design','#f-pathogen','#f-topic','#f-tag']
    .forEach(id => { const el = document.querySelector(id); if (el) el.value = ''; });
  const sort = document.getElementById('sort'); if (sort) sort.value = 'new';
  render();
}

function card(x) {
  const d = x.pubDate ? new Date(x.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';
  const pathogens = (x.pathogens || []).map(p => `<span class="pill pill-blue">${escapeHtml(p)}</span>`).join('');
  const topics    = (x.topics    || []).map(t => `<span class="pill pill-green">${escapeHtml(t)}</span>`).join('');
  const tags      = (x.tags      || []).map(t => `<span class="pill pill-purple">#${escapeHtml(t)}</span>`).join('');
  const raw = x.summary || '';
  const sum = truncateForCard(raw, 160);

  return `
  <article class="card">
    <h3><a href="${escapeAttr(x.url || '#')}" target="_blank" rel="noopener">${escapeHtml(x.title || '')}</a></h3>
    <div class="meta">
      <span class="tag">${escapeHtml(x.infection_type || 'その他')}</span>
      <span class="tag">${escapeHtml(x.journal || '誌名不明')}</span>
      <span class="tag">${escapeHtml(x.study_design || '不明')}</span>
      ${pathogens}${topics}${tags}
      <span class="date">${dateStr}</span>
    </div>
    ${sum ? `<p class="summary">${escapeHtml(sum)}</p>` : ''}
  </article>`;
}

/* util */
function truncateForCard(s, n){ const str=String(s).trim(); return (str.length<=n)?str:str.slice(0,n-1)+'…'; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeAttr(s){return String(s).replace(/"/g,'&quot;')}
function uniq(arr){return [...new Set((arr||[]).filter(Boolean))]}

load();

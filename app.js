// app.js（全文置き換え版）
// 目的：episodes.json を読み込み、検索・6種のフィルタ・並び替え・色分けバッジ付きカードを描画する。

let items = [];
const $ = (s) => document.querySelector(s);

async function load() {
  const res = await fetch('data/episodes.json', { cache: 'no-store' });
  items = await res.json();
  initFilters(items);
  render();
}

function initFilters(data) {
  // 既存フィルタ（単一値）
  fillSelect('#f-infection', uniq(data.map(d => d.infection_type)));
  fillSelect('#f-journal',   uniq(data.map(d => d.journal).filter(Boolean)));
  fillSelect('#f-design',    uniq(data.map(d => d.study_design)));

  // 追加フィルタ（配列フィールド）
  fillSelect('#f-pathogen',  uniq(data.flatMap(d => d.pathogens || [])));
  fillSelect('#f-topic',     uniq(data.flatMap(d => d.topics    || [])));
  fillSelect('#f-tag',       uniq(data.flatMap(d => d.tags      || [])));

  // 入力イベントで再描画
  [
    '#q',
    '#f-infection',
    '#f-journal',
    '#f-design',
    '#f-pathogen',
    '#f-topic',
    '#f-tag',
    '#sort'
  ].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', render);
  });
}

function fillSelect(sel, values) {
  const el = $(sel);
  if (!el) return;
  const sorted = [...values].sort((a, b) => String(a).localeCompare(String(b), 'ja'));
  for (const v of sorted) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    el.appendChild(o);
  }
}

function render() {
  const q  = ($('#q')?.value || '').trim().toLowerCase();
  const fi = $('#f-infection')?.value || '';
  const fj = $('#f-journal')?.value   || '';
  const fd = $('#f-design')?.value    || '';
  const fp = $('#f-pathogen')?.value  || '';
  const ft = $('#f-topic')?.value     || '';
  const fg = $('#f-tag')?.value       || '';
  const sort = $('#sort')?.value      || 'new';

  // 絞り込み
  let list = items.filter(x =>
    (!q  || (x.title || '').toLowerCase().includes(q)) &&
    (!fi || (x.infection_type || '') === fi) &&
    (!fj || (x.journal || '') === fj) &&
    (!fd || (x.study_design || '') === fd) &&
    (!fp || (x.pathogens || []).includes(fp)) &&
    (!ft || (x.topics    || []).includes(ft)) &&
    (!fg || (x.tags      || []).includes(fg))
  );

  // 並び替え
  if (sort === 'title') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
  } else if (sort === 'journal') {
    list.sort((a, b) => (a.journal || '').localeCompare(b.journal || '', 'ja'));
  } else {
    // 新着順（pubDate降順）
    list.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  }

  // 描画
  const container = $('#list');
  if (!container) return;
  container.innerHTML = list.length
    ? list.map(row => card(row)).join('')
    : '<p>該当なし</p>';
}

function card(x) {
  const d = x.pubDate ? new Date(x.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';
  const pathogens = (x.pathogens || []).map(p => `<span class="pill pill-blue">${escapeHtml(p)}</span>`).join('');
  const topics    = (x.topics    || []).map(t => `<span class="pill pill-green">${escapeHtml(t)}</span>`).join('');
  const tags      = (x.tags      || []).map(t => `<span class="pill pill-purple">#${escapeHtml(t)}</span>`).join('');

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
  </article>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
function escapeAttr(s) {
  // href等の属性用（最低限のエスケープ）
  return String(s).replace(/"/g, '&quot;');
}
function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

// 起動
load();

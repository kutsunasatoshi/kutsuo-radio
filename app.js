// app.js（UI強化版：全文置き換え）
let items = [];
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

async function load() {
  const res = await fetch('data/episodes.json', { cache: 'no-store' });
  items = await res.json();
  initFilters(items);
  wireUI();
  render();
}

function wireUI(){
  // フィルタ開閉
  $('#toggle-filters')?.addEventListener('click', ()=>{
    const d = $('#filters');
    if(!d) return;
    d.open = !d.open;
  });
  // リセット
  $('#reset')?.addEventListener('click', resetAll);
}

function initFilters(data) {
  // 単一値
  fillSelect('#f-infection', uniq(data.map(d => d.infection_type)));
  fillSelect('#f-journal',   uniq(data.map(d => d.journal).filter(Boolean)));
  fillSelect('#f-design',    uniq(data.map(d => d.study_design)));
  // 配列値
  fillSelect('#f-pathogen',  uniq(data.flatMap(d => d.pathogens || [])));
  fillSelect('#f-topic',     uniq(data.flatMap(d => d.topics    || [])));
  fillSelect('#f-tag',       uniq(data.flatMap(d => d.tags      || [])));

  // 入力で再描画
  [
    '#q','#f-infection','#f-journal','#f-design',
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

  // 絞り込み
  let list = items.filter(x =>
    (!s.q  || (x.title || '').toLowerCase().includes(s.q)) &&
    (!s.fi || (x.infection_type || '') === s.fi) &&
    (!s.fj || (x.journal || '') === s.fj) &&
    (!s.fd || (x.study_design || '') === s.fd) &&
    (!s.fp || (x.pathogens || []).includes(s.fp)) &&
    (!s.ft || (x.topics    || []).includes(s.ft)) &&
    (!s.fg || (x.tags      || []).includes(s.fg))
  );

  // 並び替え
  if (s.sort === 'title') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
  } else if (s.sort === 'journal') {
    list.sort((a, b) => (a.journal || '').localeCompare(b.journal || '', 'ja'));
  } else {
    list.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  }

  // 件数
  $('#count').textContent = `${list.length}件ヒット`;

  // 選択中フィルタのチップ
  renderActiveChips(s);

  // 描画
  const container = $('#list');
  container.innerHTML = list.length
    ? list.map(row => card(row)).join('')
    : '<p>該当なし</p>';
}

function renderActiveChips(s){
  const wrap = $('#active-filters');
  const chips = [];

  const labelMap = {
    fi:['感染症', s.fi],
    fj:['掲載誌', s.fj],
    fd:['研究',   s.fd],
    fp:['病原体', s.fp],
    ft:['トピック',s.ft],
    fg:['タグ',   s.fg],
    q: ['検索',   s.q]
  };

  Object.entries(labelMap).forEach(([k,[label,val]])=>{
    if (val && String(val).trim() !== '') {
      chips.push(`<span class="chip">${label}: ${escapeHtml(val)} <button aria-label="${label} 条件を解除" onclick="removeFilter('${k}')">×</button></span>`);
    }
  });

  wrap.innerHTML = chips.join('') || '';
}

function removeFilter(key){
  const map = {
    q:'#q', fi:'#f-infection', fj:'#f-journal', fd:'#f-design',
    fp:'#f-pathogen', ft:'#f-topic', fg:'#f-tag'
  };
  const sel = map[key];
  if(!sel) return;
  const el = $(sel);
  if(!el) return;
  if (el.tagName.toLowerCase()==='input') el.value='';
  else el.value='';
  render();
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

/* util */
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeAttr(s){return String(s).replace(/"/g,'&quot;')}
function uniq(arr){return [...new Set((arr||[]).filter(Boolean))]}

load();

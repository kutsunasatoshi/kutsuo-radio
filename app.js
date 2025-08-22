let items = [];
const $ = s => document.querySelector(s);

async function load() {
  const res = await fetch('data/episodes.json', {cache: 'no-store'});
  items = await res.json();
  initFilters(items);
  render();
}

function initFilters(data) {
  fillSelect('#f-infection', uniq(data.map(d => d.infection_type)));
  fillSelect('#f-journal',   uniq(data.map(d => d.journal).filter(Boolean)));
  fillSelect('#f-design',    uniq(data.map(d => d.study_design)));
  ['#q','#f-infection','#f-journal','#f-design','#sort'].forEach(id =>
    $(id).addEventListener('input', render));
}

function fillSelect(sel, arr) {
  const el = $(sel);
  arr.sort().forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  });
}

function render() {
  const q  = $('#q').value.trim().toLowerCase();
  const fi = $('#f-infection').value;
  const fj = $('#f-journal').value;
  const fd = $('#f-design').value;
  const sort = $('#sort').value;

  let list = items.filter(x =>
    (!q  || x.title.toLowerCase().includes(q)) &&
    (!fi || x.infection_type === fi) &&
    (!fj || x.journal === fj) &&
    (!fd || x.study_design === fd)
  );

  if (sort === 'title')    list.sort((a,b)=>a.title.localeCompare(b.title,'ja'));
  else if (sort === 'journal') list.sort((a,b)=>a.journal.localeCompare(b.journal,'ja'));
  else list.sort((a,b)=> new Date(b.pubDate) - new Date(a.pubDate));

  $('#list').innerHTML = list.map(row => card(row)).join('') || '<p>該当なし</p>';
}

function card(x){
  const d = x.pubDate ? new Date(x.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';
  return `
  <article class="card">
    <h3><a href="${x.url}" target="_blank" rel="noopener">${escapeHtml(x.title)}</a></h3>
    <div class="meta">
      <span class="tag">${x.infection_type}</span>
      <span class="tag">${x.journal || '誌名不明'}</span>
      <span class="tag">${x.study_design}</span>
      <span class="date">${dateStr}</span>
    </div>
  </article>`;
}

function escapeHtml(s){return s.replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function uniq(a){return [...new Set(a.filter(Boolean))]}

load();

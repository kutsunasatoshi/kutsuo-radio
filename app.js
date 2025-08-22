// app.js（軽量 index.json 版 + クリエイターURL→公開URLの正規化 + 強化検索/ハイライト）
// - 一覧は data/index.json を使用（高速）
// - 詳細は details.html?slug=... で ep/<slug>.json を1件取得
// - 外部リンク（再生ボタン）は normalizePublicUrl() で creators→podcasters 等に正規化してから使用

let items = [];
const $  = (s) => document.querySelector(s);

/* ====== 外部リンクの公開URL正規化 ======
   creators.spotify.com → podcasters.spotify.com/pod/show/<handle>/episodes/<slug>
   anchor.fm → podcasters.spotify.com に寄せる
================================================ */
function normalizePublicUrl(u){
  if(!u) return '';
  try{
    const url = new URL(u);
    // creators → podcasters（公開ページ）
    if (url.hostname === 'creators.spotify.com'){
      const m = url.pathname.match(/^\/pod\/profile\/([^/]+)\/episodes\/([^/?#]+)/);
      if (m){
        const [, handle, slug] = m;
        return `https://podcasters.spotify.com/pod/show/${handle}/episodes/${slug}`;
      }
    }
    // 旧 anchor → podcasters へ寄せる
    if (url.hostname === 'anchor.fm'){
      return u.replace('https://anchor.fm/', 'https://podcasters.spotify.com/');
    }
    return u;
  }catch{
    return u;
  }
}

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

function wireUI(){
  $('#toggle-filters')?.addEventListener('click', ()=>{
    const d = $('#filters'); if(!d) return; d.open = !d.open;
  });
  $('#reset')?.addEventListener('click', resetAll);

  // 共有ボタン（任意：存在すれば使える）
  $('#share')?.addEventListener('click', async ()=>{
    try{
      await navigator.clipboard.writeText(location.href);
      alert('現在の検索条件のURLをコピーしました。');
    }catch(e){ alert('コピーに失敗しました'); }
  });
}

function initFilters(data) {
  fillSelect('#f-infection', uniq(data.map(d => d.infection_type)));
  fillSelect('#f-journal',   uniq(data.map(d => d.journal).filter(Boolean)));
  fillSelect('#f-design',    uniq(data.map(d => d.study_design)));
  fillSelect('#f-pathogen',  uniq(data.flatMap(d => d.pathogens || [])));
  fillSelect('#f-topic',     uniq(data.flatMap(d => d.topics    || [])));
  fillSelect('#f-tag',       uniq(data.flatMap(d => d.tags      || [])));

  // 反応を軽く（デバウンス）
  const onInputDebounced = (fn, ms=150) => {
    let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
  };
  ['#q','#f-infection','#f-journal','#f-design',
   '#f-pathogen','#f-topic','#f-tag','#sort'
  ].forEach(id => $(id)?.addEventListener('input', onInputDebounced(render, 150)));

  // ショートカット：/ で検索にフォーカス、Esc で解除
  window.addEventListener('keydown', (e)=>{
    if(e.key==='/' && document.activeElement.tagName!=='INPUT'){ e.preventDefault(); $('#q')?.focus(); }
    if(e.key==='Escape'){ document.activeElement.blur(); }
  });
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
    q:  ($('#q')?.value || '').replace(/\u3000/g,' ').trim(),
    fi: $('#f-infection')?.value || '',
    fj: $('#f-journal')?.value   || '',
    fd: $('#f-design')?.value    || '',
    fp: $('#f-pathogen')?.value  || '',
    ft: $('#f-topic')?.value     || '',
    fg: $('#f-tag')?.value       || '',
    sort: $('#sort')?.value      || 'new',
  };
}

/* -------- 強化検索（AND/OR/"..."/-除外） -------- */
function parseQuery(qRaw){
  const q = (qRaw || '').trim();
  if (!q) return { includeGroups: [], exclude: [], highlight: [] };
  const phrases = []; let rest = q.replace(/"([^"]+)"/g, (_, p) => { phrases.push(p.trim()); return ' '; });
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
    x.study_design || '',
    ...(x.pathogens || []),
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
  const extra = [state.fi,state.fj,state.fd,state.fp,state.ft,state.fg].filter(Boolean);
  return [...new Set([...parsed.highlight, ...extra])].sort((a,b)=>b.length-a.length);
}
/* ---------------------------------------------- */

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

  // URL同期（共有しやすく）
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

  // 詳細ページは slug 指定で1件JSONのみ取得
  const qs = new URLSearchParams({
    slug: String(x.slug),
    q: state.q || '', fi: state.fi || '', fj: state.fj || '', fd: state.fd || '',
    fp: state.fp || '', ft: state.ft || '', fg: state.fg || ''
  }).toString();
  const detailUrl = `details.html?${qs}`;

  const sum = x.summary_short || '';
  const titleHL   = highlight(x.title || '', terms);
  const summaryHL = highlightWithNewline(sum, terms);

  // ★ 再生リンクを正規化してから使用（“▶ 詳細／再生へ”）
  const playUrl = normalizePublicUrl(x.url || '');

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
    ${playUrl ? `<div style="margin-top:8px"><a class="btn btn-primary" href="${escapeAttr(playUrl)}" target="_blank" rel="noopener">▶ 詳細／再生へ</a></div>` : ''}
  </article>`;
}

/* util */
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

load();

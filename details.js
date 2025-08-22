// details.js（関連エピソード表示 + ハイライト対応：全文）
const $ = (s)=>document.querySelector(s);

function getParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name) || '';
}
function getAllParams(){
  const u = new URL(location.href);
  const p = {};
  ['q','fi','fj','fd','fp','ft','fg'].forEach(k => p[k] = u.searchParams.get(k) || '');
  return p;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');}
function highlight(text, terms){
  let html = escapeHtml(String(text||'')).replace(/\n/g,'<br>');
  for (const t of terms) {
    if (!t) continue;
    html = html.replace(new RegExp(escapeRegExp(t),'gi'), m => `<mark>${m}</mark>`);
  }
  return html;
}
function pill(cls, text){ return `<span class="pill ${cls}">${escapeHtml(text)}</span>` }
function tag(text){ return `<span class="tag">${escapeHtml(text)}</span>` }

function scoreRelated(item, basis){
  // basis: {pathogens:Set, tags:Set, topics:Set, infection_type:String, journal:String}
  let score = 0;
  let shared = {pathogens:[], tags:[], topics:[], infection:false, journal:false};

  for (const p of (item.pathogens||[])) if (basis.pathogens.has(p)){ score += 3; shared.pathogens.push(p); }
  for (const t of (item.tags||[]))      if (basis.tags.has(t)){      score += 2; shared.tags.push(t); }
  for (const t of (item.topics||[]))    if (basis.topics.has(t)){    score += 2; shared.topics.push(t); }
  if (basis.infection_type && item.infection_type === basis.infection_type){ score += 2; shared.infection = true; }
  if (basis.journal && item.journal === basis.journal){ score += 1; shared.journal = true; }

  // 新しいエピソードに微小なボーナス（pubDateがある場合のみ）
  if (item.pubDate){
    const days = Math.max(1, (Date.now() - new Date(item.pubDate).getTime())/86400000);
    score += 0.5 / Math.log10(days + 9); // ゆるい減衰
  }

  return {score, shared};
}

function renderRelated(current, items, params){
  const basis = {
    pathogens: new Set(current.pathogens || []),
    tags:      new Set(current.tags || []),
    topics:    new Set(current.topics || []),
    infection_type: current.infection_type || '',
    journal:        current.journal || ''
  };

  // スコア付け
  const scored = [];
  for (const it of items){
    if (String(it.id) === String(current.id)) continue; // 自分自身は除外
    const {score, shared} = scoreRelated(it, basis);
    if (score <= 0) continue; // 共有なしは除外
    scored.push({item: it, score, shared});
  }

  // スコア降順→日付降順
  scored.sort((a,b)=>{
    if (b.score !== a.score) return b.score - a.score;
    const ad = new Date(a.item.pubDate||0).getTime();
    const bd = new Date(b.item.pubDate||0).getTime();
    return bd - ad;
  });

  // 上位6件
  const top = scored.slice(0,6);
  if (top.length === 0){
    $('#related').hidden = true;
    return;
  }

  // 検索・フィルタ語を引き継いでハイライト継続
  const qs = new URLSearchParams(params);

  const list = top.map(({item, shared})=>{
    const d = item.pubDate ? new Date(item.pubDate) : null;
    const dateStr = d ? d.toLocaleDateString('ja-JP') : '';
    const title = escapeHtml(item.title || '');

    // 共有要素の表示（目安）
    const bits = [];
    if (shared.pathogens.length) bits.push(shared.pathogens.map(x=>`<span class="mini mini-blue">${escapeHtml(x)}</span>`).join(' '));
    if (shared.topics.length)    bits.push(shared.topics.map(x=>`<span class="mini mini-green">${escapeHtml(x)}</span>`).join(' '));
    if (shared.tags.length)      bits.push(shared.tags.map(x=>`<span class="mini mini-purple">#${escapeHtml(x)}</span>`).join(' '));
    if (shared.infection)        bits.push(`<span class="mini">${escapeHtml(item.infection_type||'')}</span>`);
    if (shared.journal)          bits.push(`<span class="mini">${escapeHtml(item.journal||'')}</span>`);

    const detailUrl = `details.html?id=${encodeURIComponent(String(item.id))}&${qs.toString()}`;

    return `
      <article class="related-card">
        <h4 class="related-title"><a href="${detailUrl}">${title}</a></h4>
        <div class="related-meta">
          <span class="date">${dateStr}</span>
        </div>
        ${bits.length ? `<div class="related-shared">${bits.join(' ')}</div>` : ''}
      </article>
    `;
  }).join('');

  $('#related-list').innerHTML = list;
  $('#related').hidden = false;
}

(async function main(){
  const id = getParam('id');
  const params = getAllParams();
  const terms = [...new Set([...(params.q||'').split(/\s+/).filter(Boolean), params.fi, params.fj, params.fd, params.fp, params.ft, params.fg].filter(Boolean))];

  const base = location.origin + location.pathname.replace(/\/[^\/]*$/, '/');
  const res = await fetch(base + 'data/episodes.json?t=' + Date.now(), {cache:'no-store'});
  if(!res.ok){ $('#detail').innerHTML = `<div class="warn">episodes.json の取得に失敗しました（HTTP ${res.status}）。</div>`; return; }
  const items = await res.json();
  const item = items.find(x => String(x.id) === id);
  if(!item){ $('#detail').innerHTML = `<div class="warn">IDに対応するエピソードが見つかりません。</div>`; return; }

  const d = item.pubDate ? new Date(item.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';
  const pathogens = (item.pathogens||[]).map(p=>pill('pill-blue', p)).join('');
  const topics    = (item.topics   ||[]).map(t=>pill('pill-green', t)).join('');
  const tags      = (item.tags     ||[]).map(t=>pill('pill-purple', '#'+t)).join('');

  $('#detail').innerHTML = `
    <h2 class="detail-title">${highlight(item.title||'', terms)}</h2>
    <div class="detail-meta">
      ${tag(item.infection_type || 'その他')}
      ${tag(item.journal || '誌名不明')}
      ${tag(item.study_design || '不明')}
      <span class="date">${dateStr}</span>
    </div>
    ${(pathogens||topics||tags) ? `<div class="detail-pills">${pathogens}${topics}${tags}</div>` : ''}
    ${item.summary ? `<div class="detail-summary">${highlight(item.summary, terms)}</div>` : ''}
    <div class="detail-actions">
      ${item.url ? `<a class="btn btn-primary" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">▶ 元記事／再生へ</a>` : ''}
      <a class="btn" href="./">← 一覧へ戻る</a>
    </div>
  `;

  // 関連エピソード
  renderRelated(item, items, params);
})();

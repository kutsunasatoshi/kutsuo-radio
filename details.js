// details.js（ハイライト対応版：全文）
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
})();

// details.js: クエリの id で episodes.json から1件を拾って表示する
const $ = (s)=>document.querySelector(s);

function getParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name) || '';
}

function pill(cls, text){
  return `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
}

function tag(text){
  return `<span class="tag">${escapeHtml(text)}</span>`;
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

(async function main(){
  const id = getParam('id');
  const host = location.origin + location.pathname.replace(/\/[^\/]*$/, '/'); // 同ディレクトリ
  const res = await fetch(host + 'data/episodes.json?t=' + Date.now(), {cache:'no-store'});
  if(!res.ok){
    $('#detail').innerHTML = `<div class="warn">episodes.json の取得に失敗しました（HTTP ${res.status}）。</div>`;
    return;
  }
  const items = await res.json();
  const item = items.find(x => String(x.id) === id);
  if(!item){
    $('#detail').innerHTML = `<div class="warn">ID に対応するエピソードが見つかりませんでした。</div>`;
    return;
  }

  const d = item.pubDate ? new Date(item.pubDate) : null;
  const dateStr = d ? d.toLocaleDateString('ja-JP') : '';

  const pathogens = (item.pathogens||[]).map(p=>pill('pill-blue', p)).join('');
  const topics    = (item.topics   ||[]).map(t=>pill('pill-green', t)).join('');
  const tags      = (item.tags     ||[]).map(t=>pill('pill-purple', '#'+t)).join('');

  $('#detail').innerHTML = `
    <h2 class="detail-title">${escapeHtml(item.title||'')}</h2>

    <div class="detail-meta">
      ${tag(item.infection_type || 'その他')}
      ${tag(item.journal || '誌名不明')}
      ${tag(item.study_design || '不明')}
      <span class="date">${dateStr}</span>
    </div>

    ${(pathogens||topics||tags) ? `<div class="detail-pills">${pathogens}${topics}${tags}</div>` : ''}

    ${item.summary ? `<div class="detail-summary">${escapeHtml(item.summary)}</div>` : ''}

    <div class="detail-actions">
      ${item.url ? `<a class="btn btn-primary" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">▶ 元記事／再生へ</a>` : ''}
      <a class="btn" href="./">← 一覧へ戻る</a>
    </div>
  `;
})();

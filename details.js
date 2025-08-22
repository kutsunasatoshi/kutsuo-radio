// details.js（最小・確実版：creators/anchor → podcasters に強制置換してからボタンに使う）

const $ = (s)=>document.querySelector(s);

function getParam(name){ const u=new URL(location.href); return u.searchParams.get(name)||''; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function highlight(text, terms){ let html=escapeHtml(String(text||'')).replace(/\n/g,'<br>'); for(const t of terms){ if(!t)continue; html=html.replace(new RegExp(escapeRegExp(t),'gi'), m=>`<mark>${m}</mark>`);} return html; }
function pill(cls, text){ return `<span class="pill ${cls}">${escapeHtml(text)}</span>` }
function tag(text){ return `<span class="tag">${escapeHtml(text)}</span>` }

(async function main(){
  const slug = getParam('slug');
  const base = location.origin + location.pathname.replace(/\/[^\/]*$/, '/');

  try{
    // 1件だけ取得（高速）
    const res = await fetch(base + `data/ep/${encodeURIComponent(slug)}.json?t=`+Date.now(), {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const item = await res.json();

    // 表示要素
    const d = item.pubDate ? new Date(item.pubDate) : null;
    const dateStr = d ? d.toLocaleDateString('ja-JP') : '';
    const pathogens = (item.pathogens||[]).map(p=>pill('pill-blue', p)).join('');
    const topics    = (item.topics   ||[]).map(t=>pill('pill-green', t)).join('');
    const tags      = (item.tags     ||[]).map(t=>pill('pill-purple', '#'+t)).join('');

    // ★ creators/anchor を podcasters に強制置換してから使う（ここが肝）
    const playUrl = (item.url || '')
      .replace('://creators.spotify.com','://podcasters.spotify.com')
      .replace('/pod/profile/','/pod/show/')
      .replace('://anchor.fm/','://podcasters.spotify.com/');

    const buttons = [];
    if (playUrl) {
      buttons.push(`<a class="btn btn-primary" href="${escapeHtml(playUrl)}" target="_blank" rel="noopener">▶ Spotifyで再生</a>`);
    }

    // 詳細本体（※関連表示などは一旦省略、再生ボタン優先で確実化）
    $('#detail').innerHTML = `
      <h2 class="detail-title">${escapeHtml(item.title||'')}</h2>
      <div class="detail-meta">
        ${tag(item.infection_type || 'その他')}
        ${tag(item.journal || '誌名不明')}
        ${tag(item.study_design || '不明')}
        <span class="date">${dateStr}</span>
      </div>
      ${(pathogens||topics||tags) ? `<div class="detail-pills">${pathogens}${topics}${tags}</div>` : ''}
      ${item.summary ? `<div class="detail-summary">${escapeHtml(item.summary).replace(/\n/g,'<br>')}</div>` : ''}
      <div class="detail-actions">
        ${buttons.join(' ')}
        <a class="btn" href="./">← 一覧へ戻る</a>
      </div>
    `;
  }catch(e){
    $('#detail').innerHTML = `<div class="warn">詳細データの取得に失敗しました（${escapeHtml(String(e.message))}）。</div>`;
  }
})();

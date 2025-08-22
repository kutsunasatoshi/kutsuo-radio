// details.js（公開URLへ正規化 + Spotify再生ボタン + 関連表示 + ハイライト + 軽量構成）

const $ = (s)=>document.querySelector(s);

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

/* ====== クエリ／表示ユーティリティ ====== */
function getParam(name){ const u=new URL(location.href); return u.searchParams.get(name)||''; }
function getAllParams(){ const u=new URL(location.href); const p={}; ['q','fi','fj','fd','fp','ft','fg'].forEach(k=>p[k]=u.searchParams.get(k)||''); return p; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function highlight(text, terms){
  let html=escapeHtml(String(text||'')).replace(/\n/g,'<br>');
  for(const t of terms){ if(!t)continue; html=html.replace(new RegExp(escapeRegExp(t),'gi'), m=>`<mark>${m}</mark>`); }
  return html;
}
function pill(cls, text){ return `<span class="pill ${cls}">${escapeHtml(text)}</span>` }
function tag(text){ return `<span class="tag">${escapeHtml(text)}</span>` }

/* ====== 関連エピソード ====== */
function scoreRelated(item, basis){
  let score=0, shared={pathogens:[],tags:[],topics:[],infection:false,journal:false};
  for (const p of (item.pathogens||[])) if (basis.pathogens.has(p)){ score+=3; shared.pathogens.push(p); }
  for (const t of (item.tags||[]))      if (basis.tags.has(t)){      score+=2; shared.tags.push(t); }
  for (const t of (item.topics||[]))    if (basis.topics.has(t)){    score+=2; shared.topics.push(t); }
  if (basis.infection_type && item.infection_type===basis.infection_type){ score+=2; shared.infection=true; }
  if (basis.journal && item.journal===basis.journal){ score+=1; shared.journal=true; }
  if (item.pubDate){
    const days=Math.max(1,(Date.now()-new Date(item.pubDate).getTime())/86400000);
    score += 0.5 / Math.log10(days+9); // ゆるい新着ボーナス
  }
  return {score,shared};
}

function renderRelated(current, indexItems, params){
  const basis={
    pathogens:new Set(current.pathogens||[]),
    tags:new Set(current.tags||[]),
    topics:new Set(current.topics||[]),
    infection_type:current.infection_type||'',
    journal:current.journal||''
  };

  const scored=[];
  for (const it of indexItems){
    if (String(it.slug)===String(current.slug)) continue;
    const {score,shared}=scoreRelated(it,basis);
    if (score<=0) continue;
    scored.push({item:it,score,shared});
  }
  scored.sort((a,b)=> b.score-a.score || new Date(b.item.pubDate||0)-new Date(a.item.pubDate||0) );
  const top=scored.slice(0,6);
  if (!top.length){ $('#related').hidden=true; return; }

  const qs=new URLSearchParams(params);
  const html=top.map(({item,shared})=>{
    const d=item.pubDate?new Date(item.pubDate):null;
    const dateStr=d?d.toLocaleDateString('ja-JP'):'';
    const bits=[];
    if(shared.pathogens.length) bits.push(shared.pathogens.map(x=>`<span class="mini mini-blue">${escapeHtml(x)}</span>`).join(' '));
    if(shared.topics.length)    bits.push(shared.topics.map(x=>`<span class="mini mini-green">${escapeHtml(x)}</span>`).join(' '));
    if(shared.tags.length)      bits.push(shared.tags.map(x=>`<span class="mini mini-purple">#${escapeHtml(x)}</span>`).join(' '));
    if(shared.infection)        bits.push(`<span class="mini">${escapeHtml(item.infection_type||'')}</span>`);
    if(shared.journal)          bits.push(`<span class="mini">${escapeHtml(item.journal||'')}</span>`);
    const detailUrl=`details.html?slug=${encodeURIComponent(item.slug)}&${qs.toString()}`;
    return `
      <article class="related-card">
        <h4 class="related-title"><a href="${detailUrl}">${escapeHtml(item.title||'')}</a></h4>
        <div class="related-meta"><span class="date">${dateStr}</span></div>
        ${bits.length?`<div class="related-shared">${bits.join(' ')}</div>`:''}
      </article>`;
  }).join('');
  $('#related-list').innerHTML=html;
  $('#related').hidden=false;
}

/* ====== メイン処理 ====== */
(async function main(){
  const slug = getParam('slug');
  const params = getAllParams();
  const terms = [...new Set([...(params.q||'').split(/\s+/).filter(Boolean), params.fi, params.fj, params.fd, params.fp, params.ft, params.fg].filter(Boolean))];

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

    // Spotify 再生ボタン（公開URLに正規化）
    const buttons = [];
    if (item.url) {
      const playUrl = normalizePublicUrl(item.url);
      buttons.push(`<a class="btn btn-primary" href="${escapeHtml(item.url.replace('https://creators.spotify.com/pod/profile/','https://podcasters.spotify.com/pod/show/'))}" target="_blank" rel="noopener">▶ Spotifyで再生</a>`);
    }

    // 詳細本体
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
        ${buttons.join(' ')}
        <a class="btn" href="./">← 一覧へ戻る</a>
      </div>
    `;

    // 関連は軽量 index.json から（高速）
    const resIdx = await fetch(base + 'data/index.json?t='+Date.now(), {cache:'no-store'});
    const indexItems = resIdx.ok ? await resIdx.json() : [];
    renderRelated(item, indexItems, params);

  }catch(e){
    $('#detail').innerHTML = `<div class="warn">詳細データの取得に失敗しました（${escapeHtml(String(e.message))}）。</div>`;
  }
})();

// rank.js : data/spotify.json を読み、右カラムに横棒グラフで表示
// クリック時は details.html?slug=... に遷移（slug が見つからない時は Spotify URI へ）

(async function () {
  const mount = document.querySelector('#ranking');
  if (!mount) return;

  try{
    // 1) ランキングとエピソード一覧を取得
    const [spotifyRows, indexRows] = await Promise.all([
      fetch('data/spotify.json?t=' + Date.now()).then(r=> r.ok ? r.json() : []),
      fetch('data/index.json?t=' + Date.now()).then(r=> r.ok ? r.json() : [])
    ]);

    if (!Array.isArray(spotifyRows) || spotifyRows.length === 0) {
      mount.innerHTML = '<p>ランキングデータがありません（CSVを data/ に置き、Actionsを実行してください）。</p>';
      return;
    }

    // 2) slug 検索のためにタイトル正規化マップを準備
    const norm = (s)=> String(s||'')
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\s]/gu, '')  // 記号除去
      .replace(/\s+/g, ' ')              // 連続空白まとめ
      .trim();

    // token セット
    const tokens = (s)=> norm(s).split(' ').filter(Boolean);

    // index を [正規化タイトル]→配列（重複対策）で持ち、スコア付き検索に使う
    const idx = indexRows.map(ep => ({
      slug: ep.slug,
      title: ep.title || '',
      tnorm: norm(ep.title || ''),
      toks: tokens(ep.title || '')
    }));

    // 類似度（Jaccard）
    const jaccard = (a, b) => {
      const A = new Set(a), B = new Set(b);
      const inter = [...A].filter(x => B.has(x)).length;
      const uni = new Set([...A, ...B]).size;
      return uni ? inter / uni : 0;
    };

    // タイトルから最良 slug を返す（閾値 0.2）
    function findSlugByTitle(title){
      const t = title || '';
      const tt = norm(t);
      const tk = tokens(t);
      let best = {score: 0, slug: ''};

      for (const ep of idx){
        // 先頭一致に少し加点
        let score = 0;
        if (ep.tnorm.startsWith(tt.slice(0, 20))) score += 0.1;
        // Jaccard スコア
        score += jaccard(tk, ep.toks);
        if (score > best.score) best = {score, slug: ep.slug};
      }
      return best.score >= 0.2 ? best.slug : ''; // 閾値未満なら見つからず
    }

    // 3) 上位表示
    const top = spotifyRows.slice(0, Math.min(20, spotifyRows.length));
    const maxPlays = Math.max(...top.map(r => r.plays || 0), 1);

    mount.innerHTML = '';
    top.forEach((r, i) => {
      const item = document.createElement('div');
      item.className = 'rank-row';

      // 左：順位＋タイトル
      const left = document.createElement('div');
      left.className = 'rank-title';

      const no = document.createElement('span');
      no.className = 'rank-no';
      no.textContent = String(i + 1);

      const link = document.createElement('a');
      link.className = 'rank-link';
      link.title = r.title || '';
      link.textContent = r.title || '(no title)';

      // ★ ここで details.html のURLを優先的に作る
      const slug = findSlugByTitle(r.title || '');
      if (slug) {
        link.href = `details.html?slug=${encodeURIComponent(slug)}`;
        link.target = '_self'; // 同タブで開く（お好みで _blank に）
      } else {
        // フォールバック：Spotify URI（open.spotify に変換済みの想定）
        link.href = r.uri || '#';
        link.target = '_blank';
        link.rel = 'noopener';
      }

      left.appendChild(no);
      left.appendChild(link);

      // 右：棒グラフ
      const right = document.createElement('div');
      right.className = 'rank-bar-wrap';

      const bar = document.createElement('div');
      bar.className = 'rank-bar';
      bar.style.width = Math.max(5, Math.round((r.plays / maxPlays) * 100)) + '%';

      const value = document.createElement('span');
      value.className = 'rank-value';
      value.textContent = (r.plays ?? 0).toLocaleString();

      right.appendChild(bar);
      right.appendChild(value);

      item.appendChild(left);
      item.appendChild(right);
      mount.appendChild(item);
    });
  }catch(e){
    mount.innerHTML = `<p>読み込みエラー：${escapeHtml(String(e.message))}</p>`;
  }

  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
})();

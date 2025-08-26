// dashboard.js : data/spotify.json を右カラムに横棒グラフで表示
(async function () {
  const mount = document.querySelector('#ranking');
  try{
    const res = await fetch('data/spotify.json?t=' + Date.now());
    if (!res.ok) throw new Error('spotify.json not found');
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0){
      mount.innerHTML = '<p>ランキングデータがありません（CSVを data/ に置き、Actionsを実行してください）。</p>';
      return;
    }

    const top = rows.slice(0, Math.min(20, rows.length));
    const maxPlays = Math.max(...top.map(r => r.plays || 0), 1);

    mount.innerHTML = '';
    top.forEach((r, i) => {
      const item = document.createElement('div');
      item.className = 'rank-row';

      const left = document.createElement('div');
      left.className = 'rank-title';

      const no = document.createElement('span');
      no.className = 'rank-no';
      no.textContent = String(i + 1);

      const link = document.createElement('a');
      link.className = 'rank-link';
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = r.title || '';
      link.textContent = r.title || '(no title)';
      link.href = r.uri || '#';

      left.appendChild(no);
      left.appendChild(link);

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

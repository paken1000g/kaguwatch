const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/sedori')                        return handleSedori(request, env);
      if (url.pathname === '/api/items/sync')                    return handleItemsSync(request, env);
      if (url.pathname === '/api/analytics/price-distribution')  return handlePriceDist(env);
      if (url.pathname === '/api/analytics/turnover')            return handleTurnover(env);
      return handleRssProxy(url);
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  },
};

// ── RSS proxy ──────────────────────────────────────────────────────────────
async function handleRssProxy(url) {
  const feedUrl = url.searchParams.get('url');
  if (!feedUrl) return json({ error: 'url parameter required' }, 400);

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(feedUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KaguWatch/1.0; +https://github.com/paken1000g/kaguwatch)' },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
    const body = await res.text();
    const ct = res.headers.get('Content-Type') || 'text/xml; charset=utf-8';
    return new Response(body, {
      headers: {
        'Content-Type': ct,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    clearTimeout(tid);
    return json({ error: e.message }, 502);
  }
}

// ── Sedori CRUD ────────────────────────────────────────────────────────────
async function handleSedori(request, env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM sedori ORDER BY created_at DESC'
    ).all();
    return json(results);
  }

  if (request.method === 'POST') {
    const body = await request.json();
    if (!Array.isArray(body)) return json({ error: 'expected array' }, 400);

    await env.DB.prepare('DELETE FROM sedori').run();
    if (body.length > 0) {
      const stmt = env.DB.prepare(
        `INSERT INTO sedori
           (name, buy_price, sell_price, source, status, condition_grade, sell_platform, memo, purchase_date, link)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      await env.DB.batch(body.map(i => stmt.bind(
        i.name || '',
        i.buy  || 0,
        i.sell || 0,
        i.source       || '',
        i.status       || 'watching',
        i.condition    || '',
        i.sellPlatform || 'other',
        i.memo         || '',
        i.date         || '',
        i.link         || ''
      )));
    }
    return json({ ok: true, count: body.length });
  }

  return json({ error: 'method not allowed' }, 405);
}

// ── Items history sync ─────────────────────────────────────────────────────
async function handleItemsSync(request, env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503);
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const items = await request.json();
  if (!Array.isArray(items) || !items.length) return json({ ok: true, count: 0 });

  const now = new Date().toISOString();
  const ins = env.DB.prepare(
    `INSERT OR IGNORE INTO items_history (source, title, link, price_yen, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updSeen = env.DB.prepare(
    `UPDATE items_history SET last_seen = ? WHERE link = ?`
  );
  const updSold = env.DB.prepare(
    `UPDATE items_history SET is_sold = 1, sold_at = ?, last_seen = ? WHERE link = ? AND is_sold = 0`
  );

  const ops = [];
  for (const item of items) {
    const priceYen = item.price
      ? parseInt(item.price.replace(/[¥￥,円\s]/g, '')) || null
      : null;
    ops.push(ins.bind(item.source, item.title, item.link, priceYen, now, now));
    ops.push(updSeen.bind(now, item.link));
    if (item.soldOut) ops.push(updSold.bind(now, now, item.link));
  }
  await env.DB.batch(ops);
  return json({ ok: true, count: items.length });
}

// ── Analytics: 価格帯別利益分布 ────────────────────────────────────────────
async function handlePriceDist(env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503);
  const { results } = await env.DB.prepare(`
    SELECT
      price_range, sort_order,
      COUNT(*) AS count,
      ROUND(AVG(net * 1.0 / NULLIF(buy_price, 0) * 100), 1) AS avg_margin_pct,
      SUM(net) AS total_profit
    FROM (
      SELECT
        buy_price,
        sell_price - buy_price
          - CAST(sell_price * CASE sell_platform
              WHEN 'mercari' THEN 0.10
              WHEN 'yahoo'   THEN 0.088
              ELSE 0 END AS INTEGER) AS net,
        CASE
          WHEN buy_price <  10000 THEN '〜1万'
          WHEN buy_price <  30000 THEN '1〜3万'
          WHEN buy_price <  50000 THEN '3〜5万'
          WHEN buy_price < 100000 THEN '5〜10万'
          ELSE '10万〜'
        END AS price_range,
        CASE
          WHEN buy_price <  10000 THEN 1
          WHEN buy_price <  30000 THEN 2
          WHEN buy_price <  50000 THEN 3
          WHEN buy_price < 100000 THEN 4
          ELSE 5
        END AS sort_order,
        sell_platform
      FROM sedori
      WHERE status = 'sold' AND buy_price > 0 AND sell_price > 0
    )
    GROUP BY price_range, sort_order
    ORDER BY sort_order
  `).all();
  return json(results);
}

// ── Analytics: 店舗別回転速度 ──────────────────────────────────────────────
async function handleTurnover(env) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503);
  const { results } = await env.DB.prepare(`
    SELECT
      source,
      COUNT(*) AS sold_count,
      ROUND(AVG(CAST((julianday(sold_at) - julianday(first_seen)) * 24 AS REAL)), 1) AS avg_hours_to_sell
    FROM items_history
    WHERE is_sold = 1 AND sold_at IS NOT NULL
    GROUP BY source
    ORDER BY avg_hours_to_sell ASC
  `).all();
  return json(results);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

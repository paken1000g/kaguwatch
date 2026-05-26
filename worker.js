export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const feedUrl = searchParams.get('url');

    if (!feedUrl) {
      return json({ error: 'url parameter required' }, 400);
    }

    let targetUrl;
    try {
      targetUrl = new URL(feedUrl);
    } catch (e) {
      return json({ error: 'invalid url' }, 400);
    }

    // オフモールは Referer + same-origin に見せることで初期 HTML を取得できる
    const hostname = targetUrl.hostname;
    const refererMap = {
      'netmall.hardoff.co.jp': 'https://netmall.hardoff.co.jp/',
    };
    const referer = refererMap[hostname] || null;

    try {
      const res = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          ...(referer ? {
            'Referer':          referer,
            'Sec-Fetch-Dest':   'document',
            'Sec-Fetch-Mode':   'navigate',
            'Sec-Fetch-Site':   'same-origin',
          } : {
            'Sec-Fetch-Dest':   'document',
            'Sec-Fetch-Mode':   'navigate',
            'Sec-Fetch-Site':   'none',
          }),
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);

      const body = await res.text();
      const ct = res.headers.get('content-type') || 'text/html; charset=utf-8';
      return new Response(body, {
        headers: {
          'Content-Type': ct,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
        },
      });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

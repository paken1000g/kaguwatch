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

    try {
      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KaguWatch/1.0; +https://github.com/paken1000g/kaguwatch)' },
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);

      const xml = await res.text();
      return new Response(xml, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
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

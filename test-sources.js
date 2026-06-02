// 酒二次流通データソース調査スクリプト
// 実行: node test-sources.js
//
// 各ソースへのアクセス可否・データ構造を確認する

const PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';

// ── テスト対象 ────────────────────────────────────────────────

const SOURCES = [
  // ① ヤフオク RSS（過去に存在したエンドポイント）
  {
    name: 'ヤフオク RSS (mode=2)',
    type: 'rss',
    url: 'https://auctions.yahoo.co.jp/rss/search?p=山崎+ウィスキー&auccat=0&mode=2',
  },
  {
    name: 'ヤフオク RSS (outputtype=rss)',
    type: 'rss',
    url: 'https://auctions.yahoo.co.jp/search/search?p=山崎+ウィスキー&auccat=0&f=0x12&outputtype=rss',
  },

  // ② Shopify .atom フィード（酒専門セレクトショップ）
  {
    name: '信濃屋 Atom',
    type: 'atom',
    url: 'https://www.shinanoya.co.jp/collections/all.atom',
  },
  {
    name: 'LIQUORS HASEGAWA Atom',
    type: 'atom',
    url: 'https://www.e-liquor.co.jp/collections/all.atom',
  },
  {
    name: 'THE WHISKY SHOP Atom',
    type: 'atom',
    url: 'https://thewhiskyshop.jp/collections/all.atom',
  },

  // ③ メルカリ（RSSなし・参考）
  // → スクレイピング必須のため今回はスキップ

  // ④ 海外オークション（RSS確認）
  {
    name: 'Whisky Auctioneer',
    type: 'html',
    url: 'https://whisky-auctioneer.com',
  },
];

// ── fetch wrapper ─────────────────────────────────────────────

async function probe(source) {
  const targetUrl = source.type === 'rss'
    ? `${PROXY}${encodeURIComponent(source.url)}`
    : source.url;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/xml,text/xml,application/json,text/html,*/*',
      },
      signal: AbortSignal.timeout(10000),
    });

    const ct = res.headers.get('content-type') || '';
    const body = await res.text();

    if (!res.ok) {
      return { name: source.name, status: res.status, ok: false, note: `HTTP ${res.status}` };
    }

    // rss2json レスポンス
    if (targetUrl.includes('rss2json')) {
      const json = JSON.parse(body);
      if (json.status !== 'ok') {
        return { name: source.name, status: res.status, ok: false, note: `rss2json error: ${json.message}` };
      }
      const items = (json.items || []).slice(0, 3).map(i => ({
        title: i.title,
        link: i.link,
        pubDate: i.pubDate,
        price: extractPrice(i.title + ' ' + (i.description || '')),
      }));
      return { name: source.name, status: res.status, ok: true, count: json.items?.length, items };
    }

    // Atom フィード
    if (ct.includes('xml') || body.startsWith('<?xml') || body.includes('<feed')) {
      const entries = [...body.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 3).map(m => {
        const e = m[1];
        const title = (e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        const link  = (e.match(/href="([^"]+)"/) || [])[1];
        const price = extractPrice(e);
        return { title, link, price };
      });
      return { name: source.name, status: res.status, ok: true, count: (body.match(/<entry>/g) || []).length, items: entries };
    }

    // HTML
    const rssLink = (body.match(/href="([^"]*rss[^"]*)"/) || body.match(/href="([^"]*feed[^"]*)"/) || [])[1];
    return { name: source.name, status: res.status, ok: true, note: `HTML返却 RSS link: ${rssLink || 'なし'}` };

  } catch (e) {
    return { name: source.name, ok: false, note: e.message };
  }
}

function extractPrice(text) {
  const m = text.match(/[¥￥][\d,]+|[\d,]+\s*円/);
  return m ? m[0] : null;
}

// ── main ──────────────────────────────────────────────────────

(async () => {
  console.log('=== 酒二次流通データソース調査 ===\n');
  for (const src of SOURCES) {
    const r = await probe(src);
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
    if (r.ok && r.items?.length) {
      console.log(`   件数: ${r.count}`);
      r.items.forEach(i => console.log(`   - ${i.title?.slice(0, 60)}  ${i.price || ''}`));
    } else {
      console.log(`   → ${r.note || r.status}`);
    }
    console.log();
  }
})();

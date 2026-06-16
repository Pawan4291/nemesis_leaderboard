const NEMESI_CA = '0x534a29dfca1cefb6e933f6c0d00e8a43a52e60d2';
const ROUTER    = '0x5b23F24b08fa3FAa0Fa555611ACF74c3bAb23550';
const LIQUIDITY = '0x5150911745CbFCC3dAF22c46d8D9694343d2b768';
const BASE = 'https://api.etherscan.io/v2/api';

let cache = null, cacheTime = 0;

async function fetchAllPages(params) {
  let results = [], page = 1;
  while (true) {
    const qs = new URLSearchParams({ chainid: '11155111', ...params, page, offset: 10000, sort: 'asc' });
    const r = await fetch(`${BASE}?${qs}`);
    const json = await r.json();
    if (json.status !== '1' || !Array.isArray(json.result)) break;
    results = results.concat(json.result);
    if (json.result.length < 10000) break;
    page++;
    await new Promise(r => setTimeout(r, 250));
  }
  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const key = process.env.ETHERSCAN_API_KEY || '';
  if (!key) return res.status(500).json({ error: 'Missing ETHERSCAN_API_KEY' });

  // DEBUG - always runs before cache
 if (req.query.debug === '1') {
    const qs = new URLSearchParams({ chainid: '11155111', module: 'account', action: 'tokentx', contractaddress: NEMESI_CA, address: ROUTER, page: 1, offset: 5, sort: 'asc', apikey: key });
    const r = await fetch(`${BASE}?${qs}`);
    const json = await r.json();
    return res.json(json);
}

  // CACHE BUST - clears bad cached empty data
  if (req.query.bust === '1') { cache = null; cacheTime = 0; }

  const now = Date.now();
  if (cache && now - cacheTime < 5 * 60 * 1000) return res.json({ ...cache, cached: true });

  try {
    const [tokenTxs, liquidityTxs] = await Promise.all([
      fetchAllPages({ module: 'account', action: 'tokentx', contractaddress: NEMESI_CA, address: ROUTER, apikey: key }),
      fetchAllPages({ module: 'account', action: 'txlist', address: LIQUIDITY, apikey: key })
    ]);

    const traders = {};
    const router = ROUTER.toLowerCase();

    for (const tx of tokenTxs) {
      const from = tx.from.toLowerCase();
      const to   = tx.to.toLowerCase();
      if (to !== router || from === router) continue;
     const val = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal));
      const ts  = parseInt(tx.timeStamp);
      if (!traders[from]) traders[from] = { address: from, volume: 0, swaps: 0, liquidity: 0, lastSwap: 0, firstSwap: Infinity };
      traders[from].volume += val;
      traders[from].swaps  += 1;
      if (ts > traders[from].lastSwap)  traders[from].lastSwap  = ts;
      if (ts < traders[from].firstSwap) traders[from].firstSwap = ts;
    }

    for (const tx of liquidityTxs) {
      if (tx.isError !== '0' || !tx.input || tx.input.length <= 10) continue;
      const user = tx.from.toLowerCase();
      const ts   = parseInt(tx.timeStamp);
      if (!traders[user]) traders[user] = { address: user, volume: 0, swaps: 0, liquidity: 0, lastSwap: 0, firstSwap: Infinity };
      traders[user].liquidity += 1;
      if (ts > traders[user].lastSwap)  traders[user].lastSwap  = ts;
      if (ts < traders[user].firstSwap) traders[user].firstSwap = ts;
    }

    const list = Object.values(traders).sort((a, b) => b.volume - a.volume);
    cache = {
      traders: list,
      totalVolume:    list.reduce((s, t) => s + t.volume,    0),
      totalSwaps:     list.reduce((s, t) => s + t.swaps,     0),
      totalLiquidity: list.reduce((s, t) => s + t.liquidity, 0),
      totalTraders:   list.length,
      fetchedAt:      now
    };
    cacheTime = now;
    return res.json({ ...cache, cached: false });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

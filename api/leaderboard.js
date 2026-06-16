const NEMESI_CA = '0x534a29dfca1cefb6e933f6c0d00e8a43a52e60d2';
const ROUTER = '0x5b23F24b08fa3FAa0Fa555611ACF74c3bAb23550';
const BASE = 'https://api.etherscan.io/v2/api?chainid=11155111';

let cache = null;
let cacheTime = 0;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = Date.now();
  if (cache && now - cacheTime < 5 * 60 * 1000) {
    return res.json({ ...cache, cached: true });
  }

  const key = process.env.ETHERSCAN_API_KEY || '';
  if (!key) return res.status(500).json({ error: 'Missing ETHERSCAN_API_KEY' });

  try {
    let txs = [];
    let page = 1;
    while (true) {
      const url = `${BASE}&module=account&action=tokentx&contractaddress=${NEMESI_CA}&address=${ROUTER}&page=${page}&offset=10000&sort=asc&apikey=${key}`;
      const r = await fetch(url);
      const json = await r.json();
      if (json.status !== '1' || !Array.isArray(json.result)) break;
      txs = txs.concat(json.result);
      if (json.result.length < 10000) break;
      page++;
      await new Promise(r => setTimeout(r, 250));
    }

    const router = ROUTER.toLowerCase();
    const traders = {};

    for (const tx of txs) {
      const from = tx.from.toLowerCase();
      const user = from === router ? tx.to.toLowerCase() : from;
      if (user === router) continue;

      const val = parseFloat(tx.value) / 1e18;
      const ts = parseInt(tx.timeStamp);

      if (!traders[user]) {
        traders[user] = { address: user, volume: 0, swaps: 0, lastSwap: 0, firstSwap: ts };
      }
      traders[user].volume += val;
      traders[user].swaps += 1;
      if (ts > traders[user].lastSwap) traders[user].lastSwap = ts;
      if (ts < traders[user].firstSwap) traders[user].firstSwap = ts;
    }

    const list = Object.values(traders).sort((a, b) => b.volume - a.volume);

    cache = {
      traders: list,
      totalVolume: list.reduce((s, t) => s + t.volume, 0),
      totalSwaps: list.reduce((s, t) => s + t.swaps, 0),
      totalTraders: list.length,
      fetchedAt: now
    };
    cacheTime = now;

    return res.json({ ...cache, cached: false });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
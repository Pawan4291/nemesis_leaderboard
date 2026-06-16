const NEMESI_CA = '0x534a29dfca1cefb6e933f6c0d00e8a43a52e60d2';
const ROUTER = '0x5b23f24b08fa3faa0fa555611acf74c3bab23550';
const BASE = 'https://api-sepolia.etherscan.io/api';

let cache = null;
let cacheTime = 0;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = Date.now();
  if (cache && now - cacheTime < 5 * 60 * 1000) {
    return res.json({ ...cache, cached: true });
  }

  const key = process.env.ETHERSCAN_API_KEY || '';
  const url = `${BASE}?module=account&action=tokentx&contractaddress=${NEMESI_CA}&sort=asc${key ? '&apikey=' + key : ''}`;

  try {
    const r = await fetch(url);
    const json = await r.json();
    const txs = Array.isArray(json.result) ? json.result : [];

    const traders = {};
    txs.forEach(tx => {
      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      if (from !== ROUTER && to !== ROUTER) return;
      const user = from === ROUTER ? to : from;
      const val = parseFloat(tx.value) / 1e18;
      const ts = parseInt(tx.timeStamp);
      if (!traders[user]) traders[user] = { address: user, volume: 0, swaps: 0, lastSwap: 0, firstSwap: Infinity };
      traders[user].volume += val;
      traders[user].swaps += 1;
      if (ts > traders[user].lastSwap) traders[user].lastSwap = ts;
      if (ts < traders[user].firstSwap) traders[user].firstSwap = ts;
    });

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
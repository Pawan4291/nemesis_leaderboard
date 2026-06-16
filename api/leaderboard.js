const NEMESI_CA = '0x534a29dfca1cefb6e933f6c0d00e8a43a52e60d2';
const ROUTER   = '0x5b23F24b08fa3FAa0Fa555611ACF74c3bAb23550'.toLowerCase();
const BASE     = 'https://api-sepolia.etherscan.io/api';

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) {
    return res.json({ ...cache, cached: true, cacheAge: Math.round((now - cacheTime) / 1000) });
  }

  const apiKey = process.env.ETHERSCAN_API_KEY || '';
  const url = `${BASE}?module=account&action=tokentx&contractaddress=${NEMESI_CA}&sort=asc&offset=10000${apiKey ? '&apikey=' + apiKey : ''}`;

  try {
    const response = await fetch(url);
    const json = await response.json();

    if (json.status === '0' && json.message !== 'No transactions found') {
      return res.status(502).json({ error: json.result || json.message });
    }

    const txs = Array.isArray(json.result) ? json.result : [];
    const traders = {};

    txs.forEach(tx => {
      const from = tx.from.toLowerCase();
      const to   = tx.to.toLowerCase();
      const isSwap = from === ROUTER || to === ROUTER;
      if (!isSwap) return;

      const user = from === ROUTER ? to : from;
      const val  = parseFloat(tx.value) / 1e18;
      const ts   = parseInt(tx.timeStamp);

      if (!traders[user]) traders[user] = { address: user, volume: 0, swaps: 0, lastSwap: 0, firstSwap: Infinity };
      traders[user].volume  += val;
      traders[user].swaps   += 1;
      if (ts > traders[user].lastSwap)  traders[user].lastSwap  = ts;
      if (ts < traders[user].firstSwap) traders[user].firstSwap = ts;
    });

    const list = Object.values(traders).sort((a, b) => b.volume - a.volume);
    const totalVolume = list.reduce((s, t) => s + t.volume, 0);
    const totalSwaps  = list.reduce((s, t) => s + t.swaps, 0);

    cache = { traders: list, totalVolume, totalSwaps, totalTraders: list.length, fetchedAt: now };
    cacheTime = now;

    return res.json({ ...cache, cached: false, cacheAge: 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

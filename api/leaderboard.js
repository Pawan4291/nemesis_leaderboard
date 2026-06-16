const NEMESI_CA = '0x534a29dfca1cefb6e933f6c0d00e8a43a52e60d2';
const ROUTER = '0x5b23F24b08fa3FAa0Fa555611ACF74c3bAb23550';
const LIQUIDITY = '0x5150911745CbFCC3dAF22c46d8D9694343d2b768';
const BASE = 'https://api.etherscan.io/v2/api?chainid=11155111';

let cache = null;
let cacheTime = 0;

async function fetchTxs(address, key) {
  let txs = [];
  let page = 1;
  while (true) {
    const url = `${BASE}&module=account&action=txlist&address=${address}&page=${page}&offset=10000&sort=asc&apikey=${key}`;
    const r = await fetch(url);
    const json = await r.json();
    if (json.status !== '1' || !Array.isArray(json.result)) break;
    const valid = json.result.filter(tx =>
      tx.to.toLowerCase() === address.toLowerCase() &&
      tx.isError === '0' &&
      tx.input && tx.input.length > 10
    );
    txs = txs.concat(valid);
    if (json.result.length < 10000) break;
    page++;
    await new Promise(r => setTimeout(r, 250));
  }
  return txs;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const now = Date.now();
  if (cache && now - cacheTime < 5 * 60 * 1000) {
    return res.json({ ...cache, cached: true });
  }

  const key = process.env.ETHERSCAN_API_KEY || '';
  if (!key) return res.status(500).json({ error: 'Missing ETHERSCAN_API_KEY' });

  try {
    const [swapTxs, liquidityTxs] = await Promise.all([
      fetchTxs(ROUTER, key),
      fetchTxs(LIQUIDITY, key)
    ]);

    // Get NEMESI volume
    let tokenTxs = [];
    let page = 1;
    while (true) {
const url = `${BASE}&module=account&action=tokentx&contractaddress=${NEMESI_CA}&address=${ROUTER}&page=${page}&offset=10000&sort=asc&apikey=${key}`;
      const r = await fetch(url);
      const json = await r.json();
      if (json.status !== '1' || !Array.isArray(json.result)) break;
      tokenTxs = tokenTxs.concat(json.result);
      if (json.result.length < 10000) break;
      page++;
      await new Promise(r => setTimeout(r, 250));
    }

   const volumeByHash = {};
for (const tx of tokenTxs) {
  if (tx.from.toLowerCase() !== ROUTER.toLowerCase()) continue;
  const val = parseFloat(tx.value) / 1e6;
  volumeByHash[tx.hash] = (volumeByHash[tx.hash] || 0) + val;
}

    const traders = {};

    for (const tx of swapTxs) {
      const user = tx.from.toLowerCase();
      const ts = parseInt(tx.timeStamp);
      if (!traders[user]) traders[user] = { address: user, volume: 0, swaps: 0, liquidity: 0, lastSwap: 0, firstSwap: ts };
      traders[user].volume += volumeByHash[tx.hash] || 0;
      traders[user].swaps += 1;
      if (ts > traders[user].lastSwap) traders[user].lastSwap = ts;
      if (ts < traders[user].firstSwap) traders[user].firstSwap = ts;
    }

    for (const tx of liquidityTxs) {
      const user = tx.from.toLowerCase();
      const ts = parseInt(tx.timeStamp);
      if (!traders[user]) traders[user] = { address: user, volume: 0, swaps: 0, liquidity: 0, lastSwap: 0, firstSwap: ts };
      traders[user].liquidity += 1;
      if (ts > traders[user].lastSwap) traders[user].lastSwap = ts;
      if (ts < traders[user].firstSwap) traders[user].firstSwap = ts;
    }

    const list = Object.values(traders).sort((a, b) => b.volume - a.volume);

    cache = {
      traders: list,
      totalVolume: list.reduce((s, t) => s + t.volume, 0),
      totalSwaps: list.reduce((s, t) => s + t.swaps, 0),
      totalLiquidity: list.reduce((s, t) => s + t.liquidity, 0),
      totalTraders: list.length,
      fetchedAt: now
    };
    cacheTime = now;

    return res.json({ ...cache, cached: false });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
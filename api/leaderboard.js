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
    // Step 1: Get all normal txs sent TO the router (these are the actual swaps)
    let swapTxs = [];
    let page = 1;
    while (true) {
      const url = `${BASE}&module=account&action=txlist&address=${ROUTER}&page=${page}&offset=10000&sort=asc&apikey=${key}`;
      const r = await fetch(url);
      const json = await r.json();
      if (json.status !== '1' || !Array.isArray(json.result)) break;
      // Only keep swap calls to the router
      const swaps = json.result.filter(tx =>
        tx.to.toLowerCase() === ROUTER.toLowerCase() &&
        tx.isError === '0' &&
        tx.input && tx.input.length > 10
      );
      swapTxs = swapTxs.concat(swaps);
      if (json.result.length < 10000) break;
      page++;
      await new Promise(r => setTimeout(r, 250));
    }

    // Step 2: Get NEMESI token transfers to calculate volume
    let tokenTxs = [];
    page = 1;
    while (true) {
      const url = `${BASE}&module=account&action=tokentx&contractaddress=${NEMESI_CA}&page=${page}&offset=10000&sort=asc&apikey=${key}`;
      const r = await fetch(url);
      const json = await r.json();
      if (json.status !== '1' || !Array.isArray(json.result)) break;
      tokenTxs = tokenTxs.concat(json.result);
      if (json.result.length < 10000) break;
      page++;
      await new Promise(r => setTimeout(r, 250));
    }

    // Map tx hash → NEMESI volume
    const volumeByHash = {};
    for (const tx of tokenTxs) {
      const val = parseFloat(tx.value) / 1e18;
      volumeByHash[tx.hash] = (volumeByHash[tx.hash] || 0) + val;
    }

    // Step 3: Build trader stats from swap txs
    const traders = {};
    for (const tx of swapTxs) {
      const user = tx.from.toLowerCase();
      const ts = parseInt(tx.timeStamp);
      const vol = volumeByHash[tx.hash] || 0;

      if (!traders[user]) {
        traders[user] = { address: user, volume: 0, swaps: 0, lastSwap: 0, firstSwap: ts };
      }
      traders[user].volume += vol;
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
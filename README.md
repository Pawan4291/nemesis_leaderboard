# Nemesis Testnet Leaderboard

Community-built leaderboard for [Nemesis DEX](https://nemesis.trade) on Sepolia testnet.
Tracks real on-chain swap volume and ranks every wallet. Zero fake data.

## Live links
- Trade: https://nemesis.trade/trade
- Twitter: https://x.com/nemesisdottrade
- Telegram: https://t.me/nemesisdottrade

## Contract addresses (Sepolia)
- Router: `0x5b23F24b08fa3FAa0Fa555611ACF74c3bAb23550`
- NEMESI Token: `0x534a29dfca1cefb6e933f6c0d00e8a43a52e60d2`

---

## How to deploy (VSCode + GitHub + Vercel)

### Step 1 — Open in VSCode
```
Open this folder in VSCode
```

### Step 2 — Push to GitHub
1. Go to github.com → New repository → name it `nemesis-leaderboard`
2. In VSCode terminal:
```bash
git init
git add .
git commit -m "initial: nemesis testnet leaderboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nemesis-leaderboard.git
git push -u origin main
```

### Step 3 — Deploy on Vercel
1. Go to vercel.com → New Project
2. Import your GitHub repo
3. Click Deploy — done!

### Step 4 (optional) — Add Etherscan API key
In Vercel dashboard → your project → Settings → Environment Variables:
```
Name:  ETHERSCAN_API_KEY
Value: your_free_api_key_from_etherscan.io
```
Get a free key at: https://etherscan.io/myapikey

---

## How it works (no credit waste)

The backend `/api/leaderboard.js` runs as a Vercel serverless function.
- It caches the Etherscan response for **5 minutes server-side**
- 100 users hitting the site at the same time = still only **1 call** to Etherscan
- Data is parsed entirely server-side — router swaps are filtered, wallets ranked

## File structure
```
nemesis-leaderboard/
├── api/
│   └── leaderboard.js     ← Serverless function (Etherscan fetch + cache)
├── public/
│   ├── index.html         ← Main page
│   ├── css/
│   │   └── style.css      ← All styles + animations
│   └── js/
│       ├── particles.js   ← Background particle animation
│       └── app.js         ← Leaderboard logic, my stats, typed effect
├── vercel.json            ← Routing config
└── README.md
```

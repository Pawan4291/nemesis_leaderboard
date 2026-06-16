/* ── Config ── */
const API_URL   = '/api/leaderboard';
const ESCAN_URL = 'https://sepolia.etherscan.io/address/';
const PER_PAGE  = 20;

/* ── State ── */
let traders    = [];
let totalVol   = 0;
let sortField  = 'volume';
let page       = 1;
let fetchedAt  = null;
let isLoading  = false;

/* ── DOM refs ── */
const $ = id => document.getElementById(id);

/* ── Typed text effect ── */
function initTyped() {
  const el = document.querySelector('.typed-target');
  if (!el) return;
  const words = ['Dominate.', 'Earn Ranks.', 'Own Testnet.', 'Win.'];
  let wi = 0, ci = 0, deleting = false;
  const cursor = document.createElement('span');
  cursor.className = 'typed-cursor';
  el.after(cursor);

  function tick() {
    const word = words[wi];
    if (!deleting) {
      el.textContent = word.slice(0, ci + 1);
      ci++;
      if (ci === word.length) { deleting = true; setTimeout(tick, 1800); return; }
      setTimeout(tick, 80);
    } else {
      el.textContent = word.slice(0, ci - 1);
      ci--;
      if (ci === 0) { deleting = false; wi = (wi + 1) % words.length; setTimeout(tick, 300); return; }
      setTimeout(tick, 45);
    }
  }
  setTimeout(tick, 600);
}

/* ── Reveal on scroll ── */
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ── Navbar scroll ── */
function initNavbar() {
  const nav = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  const ham = $('hamburger');
  const mob = $('mobile-menu');
  ham.addEventListener('click', () => mob.classList.toggle('open'));
  document.querySelectorAll('.mob-link').forEach(l => {
    l.addEventListener('click', () => mob.classList.remove('open'));
  });
}

/* ── Format helpers ── */
function fmtNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(2);
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function shortAddr(addr) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}
function animateNum(el, target, duration, fmt) {
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * ease);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Fetch data ── */
async function fetchData() {
  if (isLoading) return;
  isLoading = true;

  const btn = $('refresh-btn');
  if (btn) btn.classList.add('loading');
  $('lb-error').style.display = 'none';
  $('lb-loading').style.display = 'flex';
  $('lb-table-wrap').style.display = 'none';
  $('lb-empty').style.display = 'none';

  try {
    const res  = await fetch(API_URL);
    const data = await res.json();

    if (!res.ok || data.error) {
      showError(data.error || 'Failed to fetch data. Please try again.');
      return;
    }

    traders   = data.traders   || [];
    totalVol  = data.totalVolume || 0;
    fetchedAt = data.fetchedAt  || Date.now();

    updateGlobalStats(data);
    page = 1;
    renderTable();
  } catch (err) {
    showError('Network error: ' + err.message);
  } finally {
    isLoading = false;
    if (btn) btn.classList.remove('loading');
    $('lb-loading').style.display = 'none';
  }
}

function showError(msg) {
  $('lb-error').textContent = msg;
  $('lb-error').style.display = 'block';
  $('lb-loading').style.display = 'none';
}

/* ── Stats bar ── */
function updateGlobalStats(data) {
  animateNum($('sb-traders'),   data.totalTraders,   800, n => Math.round(n).toLocaleString());
  animateNum($('sb-swaps'),     data.totalSwaps,     800, n => Math.round(n).toLocaleString());
  animateNum($('sb-liquidity'), data.totalLiquidity, 800, n => Math.round(n).toLocaleString());
  animateNum($('sb-vol'),       data.totalVolume,    800, n => fmtNum(n));
  $('sb-updated').textContent = new Date(data.fetchedAt).toLocaleTimeString();
}

/* ── Leaderboard render ── */
function renderTable() {
  const sorted = [...traders].sort((a, b) => {
    if (sortField === 'total') return (b.swaps + b.liquidity) - (a.swaps + a.liquidity);
    return b[sortField] - a[sortField];
  });
  const maxVal = sorted[0] ? (sortField === 'total' ? sorted[0].swaps + sorted[0].liquidity : sorted[0][sortField]) : 1;

  if (!sorted.length) {
    $('lb-empty').style.display = 'block';
    $('lb-table-wrap').style.display = 'none';
    $('pag-row').style.display = 'none';
    return;
  }

  const start    = (page - 1) * PER_PAGE;
  const pageData = sorted.slice(start, start + PER_PAGE);
  const maxPage  = Math.ceil(sorted.length / PER_PAGE);

  const tbody = $('lb-body');
  tbody.innerHTML = '';

  pageData.forEach((t, i) => {
    const rank   = start + i + 1;
    const val    = sortField === 'total' ? t.swaps + t.liquidity : t[sortField];
    const barPct = Math.round((val / maxVal) * 100);
    const medal  = rank === 1 ? 'medal-1' : rank === 2 ? 'medal-2' : rank === 3 ? 'medal-3' : 'medal-n';
    const esLink = ESCAN_URL + t.address;
    const total  = t.swaps + (t.liquidity || 0);

    const tr = document.createElement('tr');
    tr.style.animationDelay = (i * 25) + 'ms';
    tr.innerHTML = `
      <td class="rank-cell">
        <span class="rank-medal ${medal}">${rank}</span>
      </td>
      <td class="addr-cell">
        <span class="addr-short" title="${t.address}" onclick="copyAddr('${t.address}', this)">${shortAddr(t.address)}</span>
      </td>
      <td class="vol-cell">
        <div class="vol-wrap">
          <span>${fmtNum(t.volume)}</span>
          <div class="vol-bar-bg"><div class="vol-bar-fill" style="width:${barPct}%"></div></div>
        </div>
      </td>
      <td class="swaps-cell">${t.swaps}</td>
      <td class="swaps-cell">${t.liquidity || 0}</td>
      <td class="swaps-cell">${total}</td>
      <td class="date-cell">${fmtDate(t.lastSwap)}</td>
      <td class="link-cell"><a href="${esLink}" target="_blank" rel="noopener">Etherscan ↗</a></td>
    `;
    tbody.appendChild(tr);
  });

  $('lb-table-wrap').style.display = 'block';

  const pagRow = $('pag-row');
  if (maxPage > 1) {
    pagRow.style.display = 'flex';
    $('pag-info').textContent = `Page ${page} of ${maxPage}`;
    $('pag-prev').disabled = page <= 1;
    $('pag-next').disabled = page >= maxPage;
  } else {
    pagRow.style.display = 'none';
  }
}

function copyAddr(addr, el) {
  navigator.clipboard.writeText(addr).then(() => {
    const orig = el.textContent;
    el.textContent = 'Copied!';
    setTimeout(() => { el.textContent = orig; }, 1200);
  });
}

/* ── Sort pills ── */
function initSortPills() {
  document.querySelectorAll('.sort-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortField = btn.dataset.sort;
      page = 1;
      renderTable();
    });
  });
}

/* ── Pagination ── */
function initPagination() {
  $('pag-prev').addEventListener('click', () => { if (page > 1) { page--; renderTable(); scrollToLB(); } });
  $('pag-next').addEventListener('click', () => {
    const max = Math.ceil(traders.length / PER_PAGE);
    if (page < max) { page++; renderTable(); scrollToLB(); }
  });
}
function scrollToLB() {
  document.getElementById('leaderboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Refresh button ── */
function initRefresh() {
  $('refresh-btn').addEventListener('click', () => fetchData());
}

/* ── My Stats ── */
function initMyStats() {
  const btn   = $('wallet-btn');
  const input = $('wallet-input');

  btn.addEventListener('click', lookup);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') lookup(); });

  function lookup() {
    const addr = input.value.trim().toLowerCase();
    $('my-result').style.display   = 'none';
    $('my-notfound').style.display = 'none';
    $('my-nodata').style.display   = 'none';

    if (!/^0x[0-9a-f]{40}$/.test(addr)) {
      $('my-nodata').style.display = 'block';
      $('my-nodata').querySelector('p').textContent = 'Please enter a valid Ethereum wallet address (0x…).';
      return;
    }
    if (!traders.length) {
      $('my-nodata').style.display = 'block';
      return;
    }

    const sorted = [...traders].sort((a, b) => b.volume - a.volume);
    const trader = sorted.find(t => t.address === addr);

    if (!trader) {
      $('my-notfound').style.display = 'block';
      return;
    }

    const rank   = sorted.indexOf(trader) + 1;
    const topPct = ((rank / sorted.length) * 100).toFixed(0);
    const share  = totalVol > 0 ? ((trader.volume / totalVol) * 100).toFixed(2) : '0';
    const abbrev = addr.slice(2, 4).toUpperCase();
    const total  = trader.swaps + (trader.liquidity || 0);

    $('p-avatar').textContent  = abbrev;
    $('p-rank').textContent    = `Rank #${rank}`;
    $('p-addr').textContent    = addr;
    $('p-ethlink').href        = ESCAN_URL + addr;
    $('p-vol').textContent     = fmtNum(trader.volume);
    $('p-swaps').textContent   = trader.swaps;
    $('p-liquidity').textContent = trader.liquidity || 0;
    $('p-total').textContent   = total;
    $('p-share').textContent   = share + '%';
    $('p-pct').textContent     = 'Top ' + topPct + '%';
    $('p-first').textContent   = fmtDate(trader.firstSwap === Infinity ? 0 : trader.firstSwap);
    $('p-last').textContent    = fmtDate(trader.lastSwap);

    $('my-result').style.display = 'block';
    $('my-result').classList.remove('visible');
    setTimeout(() => $('my-result').classList.add('visible'), 50);
  }
}

/* ── Init ── */
window.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initTyped();
  initReveal();
  initSortPills();
  initPagination();
  initRefresh();
  initMyStats();
  fetchData();
});

window.copyAddr = copyAddr;
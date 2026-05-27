/* =========================================================
   FC26 Pack Opener — app.js
   ========================================================= */

'use strict';

// ---- Stato applicazione ----
const state = {
  config: { ovr_min: 75, ovr_max: 82, num_cards: 5, include_gk: true },
  currentPack: [],
  revealedCount: 0,
  isLoading: false,
};

// ---- Elementi DOM ----
const $ = id => document.getElementById(id);
const btnOpen       = $('btn-open');
const btnRevealAll  = $('btn-reveal-all');
const playArea      = $('play-area');
const poolCount     = $('pool-count');
const inpOvrMin     = $('inp-ovr-min');
const inpOvrMax     = $('inp-ovr-max');
const inpNumCards   = $('inp-num-cards');
const togGk         = $('tog-gk');

// ---- Tier carta in base all'OVR ----
function cardTier(ovr) {
  if (ovr >= 87) return 'tier-elite';
  if (ovr >= 82) return 'tier-high';
  if (ovr >= 75) return 'tier-mid';
  return 'tier-low';
}

// ---- Colore stat ----
function statColor(val) {
  if (val >= 85) return '#f0d080';
  if (val >= 75) return '#48bb78';
  if (val >= 65) return '#4a90d9';
  return '#9090b0';
}

// ---- Render singola carta ----
function buildCardHTML(player, idx) {
  const tier = cardTier(player.overall);
  const statsEntries = Object.entries(player.stats);

  const statsHTML = statsEntries.map(([lbl, val]) => `
    <div class="stat-item">
      <span class="stat-val" style="color:${statColor(val)}">${val}</span>
      <span class="stat-lbl">${lbl}</span>
    </div>`).join('');

  const imgHTML = player.face_url
    ? `<img src="${player.face_url}" alt="${player.name}" loading="lazy" onerror="this.style.display='none'">`
    : `<span style="font-size:3.5rem;opacity:0.5">⚽</span>`;

  return `
    <div class="card-wrapper" data-idx="${idx}" style="animation-delay:${idx * 0.12}s">
      <div class="card-inner">
        <div class="card-face card-back">
          <span class="back-logo">⚽</span>
        </div>
        <div class="card-face card-front ${tier}">
          <div class="card-header">
            <div>
              <div class="card-ovr">${player.overall}</div>
              <div class="card-pos">${player.position}</div>
            </div>
          </div>
          <div class="card-img-wrap">
            ${imgHTML}
          </div>
          <div class="card-name">${player.name}</div>
          <div class="card-club">${player.club}</div>
          <div class="card-divider"></div>
          <div class="card-stats">${statsHTML}</div>
          <div class="card-shine"></div>
        </div>
      </div>
    </div>`;
}

// ---- Render dell'intera griglia ----
function renderPack(players) {
  const grid = document.createElement('div');
  grid.className = 'cards-grid';
  grid.id = 'cards-grid';
  grid.innerHTML = players.map((p, i) => buildCardHTML(p, i)).join('');

  playArea.innerHTML = '';

  // Pulsante "Rivela tutte"
  const revealBtn = document.createElement('button');
  revealBtn.id = 'btn-reveal-all';
  revealBtn.textContent = '⚡ Rivela tutte';
  revealBtn.onclick = revealAll;
  playArea.appendChild(revealBtn);
  playArea.appendChild(grid);

  // Click su singola carta → flip
  grid.querySelectorAll('.card-wrapper').forEach(el => {
    el.addEventListener('click', () => revealCard(el));
  });
}

// ---- Rivela singola carta con effetto ----
function revealCard(wrapper) {
  if (wrapper.classList.contains('revealed')) return;
  wrapper.classList.add('revealed');
  state.revealedCount++;

  // Rimuovi shine dopo animazione
  const shine = wrapper.querySelector('.card-shine');
  if (shine) setTimeout(() => shine.remove(), 900);

  // Se tutte rivelate → nascondi il pulsante
  if (state.revealedCount >= state.currentPack.length) {
    const btn = $('btn-reveal-all');
    if (btn) btn.classList.add('hidden');
  }
}

// ---- Rivela tutte con delay progressivo ----
function revealAll() {
  const wrappers = document.querySelectorAll('.card-wrapper:not(.revealed)');
  wrappers.forEach((w, i) => {
    setTimeout(() => revealCard(w), i * 180);
  });
  const btn = $('btn-reveal-all');
  if (btn) btn.classList.add('hidden');
}

// ---- Apertura pacchetto ----
async function openPack() {
  if (state.isLoading) return;
  state.isLoading = true;
  state.revealedCount = 0;
  btnOpen.disabled = true;

  // Leggi config dal form
  const ovr_min = parseInt(inpOvrMin.value);
  const ovr_max = parseInt(inpOvrMax.value);
  const num_cards = parseInt(inpNumCards.value);
  const include_gk = togGk.checked;

  // Loader
  playArea.innerHTML = `
    <div class="loader">
      <div class="spinner"></div>
      <span>Generazione pacchetto...</span>
    </div>`;

  try {
    const res = await fetch('/api/pack/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ovr_min, ovr_max, num_cards, include_gk }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Errore HTTP ${res.status}`);
    }

    state.currentPack = data.players;
    renderPack(data.players);
  } catch (err) {
    playArea.innerHTML = `<div class="error-msg">⚠️ ${err.message}</div>`;
  } finally {
    state.isLoading = false;
    btnOpen.disabled = false;
  }
}

// ---- Aggiorna conteggio pool in tempo reale ----
async function updatePoolCount() {
  const ovr_min = parseInt(inpOvrMin.value);
  const ovr_max = parseInt(inpOvrMax.value);
  const include_gk = togGk.checked;
  if (isNaN(ovr_min) || isNaN(ovr_max) || ovr_min > ovr_max) {
    poolCount.innerHTML = '<span style="color:var(--red)">Range non valido</span>';
    return;
  }
  try {
    const res = await fetch('/api/players/stats');
    const data = await res.json();
    let total = 0;
    for (const [ovr, cnt] of Object.entries(data.distribution)) {
      const o = parseInt(ovr);
      if (o >= ovr_min && o <= ovr_max) total += cnt;
    }
    poolCount.innerHTML = `<strong>${total.toLocaleString()}</strong> giocatori disponibili`;
  } catch {
    poolCount.innerHTML = '—';
  }
}

// ---- Particelle di sfondo ----
function initParticles() {
  const container = document.createElement('div');
  container.className = 'particles';
  document.body.prepend(container);
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (6 + Math.random() * 10) + 's';
    p.style.animationDelay = (Math.random() * 12) + 's';
    p.style.opacity = 0;
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    container.appendChild(p);
  }
}

// ---- Init ----
function init() {
  initParticles();

  btnOpen.addEventListener('click', openPack);

  // Aggiorna pool count al cambio dei parametri
  const debouncedUpdate = debounce(updatePoolCount, 400);
  [inpOvrMin, inpOvrMax, togGk].forEach(el =>
    el.addEventListener('input', debouncedUpdate)
  );

  // Validazione range OVR in tempo reale
  inpOvrMin.addEventListener('change', () => {
    const mn = parseInt(inpOvrMin.value);
    const mx = parseInt(inpOvrMax.value);
    if (mn > mx) inpOvrMax.value = mn;
    updatePoolCount();
  });
  inpOvrMax.addEventListener('change', () => {
    const mn = parseInt(inpOvrMin.value);
    const mx = parseInt(inpOvrMax.value);
    if (mx < mn) inpOvrMin.value = mx;
    updatePoolCount();
  });

  updatePoolCount();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

document.addEventListener('DOMContentLoaded', init);

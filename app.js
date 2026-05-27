'use strict';

/* =========================================================
   FC26 Pack Opener — app.js
   ========================================================= */

// ---- Costanti ----
const OUTFIELD_STATS = ['PAC','SHO','PAS','DRI','DEF','PHY'];
const GK_STATS       = ['DIV','HAN','KIC','POS','REF','SPD'];
const APP_URL        = window.location.origin;

// ---- Stato ----
const state = {
  currentPack: [],
  revealedCount: 0,
  isLoading: false,
  rosters: [],           // [{name, ids:[...]}]
};

// ---- Elementi DOM ----
const $ = id => document.getElementById(id);
const btnOpen      = $('btn-open');
const playArea     = $('play-area');
const poolCount    = $('pool-count');
const inpOvrMin    = $('inp-ovr-min');
const inpOvrMax    = $('inp-ovr-max');
const inpNumCards  = $('inp-num-cards');
const togGk        = $('tog-gk');
const selPosition  = $('sel-position');
const rosterUpload = $('roster-upload');
const rosterList   = $('roster-list');
const excludedCount= $('excluded-count');

// ---- Tier colore carta ----
function cardTier(ovr) {
  if (ovr >= 87) return 'tier-elite';
  if (ovr >= 82) return 'tier-high';
  if (ovr >= 75) return 'tier-mid';
  return 'tier-low';
}

function statColor(val) {
  if (val >= 85) return '#f0d080';
  if (val >= 75) return '#48bb78';
  if (val >= 65) return '#4a90d9';
  return '#9090b0';
}

// ---- Costruisce griglia stat-filters ----
function buildStatFilters() {
  const isGK = selPosition.value === 'GK';
  const keys = isGK ? GK_STATS : OUTFIELD_STATS;
  $('stat-type-label').textContent = isGK ? '(portiere)' : '(outfield)';
  const grid = $('stat-filters-grid');
  grid.innerHTML = keys.map(k => `
    <div class="stat-filter-item">
      <label for="stat-${k}">${k}</label>
      <input type="number" id="stat-${k}" data-stat="${k}" value="0" min="0" max="99"
        oninput="onStatInput(this)" onchange="debouncedPool()">
    </div>`).join('');
}

function onStatInput(el) {
  const val = parseInt(el.value) || 0;
  el.setAttribute('data-active', val > 0 ? 'true' : 'false');
}

function getMinStats() {
  const stats = {};
  document.querySelectorAll('[data-stat]').forEach(el => {
    const val = parseInt(el.value) || 0;
    if (val > 0) stats[el.dataset.stat] = val;
  });
  return stats;
}

// ---- Escludi giocatori dalle rose ----
function getAllExcludedIds() {
  const ids = [];
  state.rosters.forEach(r => ids.push(...r.ids));
  return [...new Set(ids)];
}

function updateExcludedCount() {
  const total = getAllExcludedIds().length;
  if (total > 0) {
    excludedCount.textContent = `🚫 ${total} giocatori esclusi dalle rose caricate`;
    excludedCount.classList.remove('hidden');
  } else {
    excludedCount.classList.add('hidden');
  }
}

function renderRosterList() {
  rosterList.innerHTML = state.rosters.map((r, i) => `
    <div class="roster-item">
      <div class="roster-item-info">
        <span class="roster-item-name">${r.name}</span>
        <span class="roster-item-count">${r.ids.length} giocatori</span>
      </div>
      <button class="roster-remove" onclick="removeRoster(${i})" title="Rimuovi">✕</button>
    </div>`).join('');
  updateExcludedCount();
  debouncedPool();
}

function removeRoster(idx) {
  state.rosters.splice(idx, 1);
  renderRosterList();
}

// ---- Parsing file JSON roster ----
function parseRosterJSON(filename, raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }

  let ids = [];

  if (Array.isArray(parsed)) {
    // [id, id, ...] oppure [{id:...}, ...]
    ids = parsed.map(x => typeof x === 'object' ? (x.id || x.player_id) : x).filter(Boolean).map(Number);
  } else if (parsed.players) {
    // {players: [{id:...},...]} oppure {players: [id,...]}
    ids = parsed.players.map(x => typeof x === 'object' ? (x.id || x.player_id) : x).filter(Boolean).map(Number);
  } else if (parsed.squad) {
    ids = parsed.squad.map(x => typeof x === 'object' ? (x.id || x.player_id) : x).filter(Boolean).map(Number);
  }

  if (!ids.length) return null;
  const name = parsed.team || parsed.name || parsed.team_name || filename.replace('.json','');
  return { name, ids };
}

// ---- Upload rose ----
rosterUpload.addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    const raw = await file.text();
    const roster = parseRosterJSON(file.name, raw);
    if (roster) {
      // evita duplicati per nome
      if (!state.rosters.find(r => r.name === roster.name)) {
        state.rosters.push(roster);
      }
    } else {
      alert(`File "${file.name}" non riconosciuto. Assicurati che sia nel formato corretto.`);
    }
  }
  e.target.value = '';
  renderRosterList();
});

// ---- Toggle sezioni collassabili ----
function toggleSection(sectionId, arrowId) {
  const section = $(sectionId);
  const arrow   = $(arrowId);
  section.classList.toggle('hidden');
  arrow.classList.toggle('open');
}

// ---- Raccoglie config completo ----
function getConfig() {
  return {
    ovr_min: parseInt(inpOvrMin.value),
    ovr_max: parseInt(inpOvrMax.value),
    num_cards: parseInt(inpNumCards.value),
    include_gk: togGk.checked,
    position_filter: selPosition.value,
    min_stats: getMinStats(),
    excluded_ids: getAllExcludedIds(),
  };
}

// ---- Pool count ----
async function updatePoolCount() {
  const cfg = getConfig();
  if (isNaN(cfg.ovr_min) || isNaN(cfg.ovr_max) || cfg.ovr_min > cfg.ovr_max) {
    poolCount.innerHTML = '<span style="color:var(--red)">Range non valido</span>';
    return;
  }
  try {
    const res = await fetch('/api/pack/pool', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    if (data.pool_size !== undefined) {
      poolCount.innerHTML = `<strong>${data.pool_size.toLocaleString()}</strong> giocatori disponibili`;
    }
  } catch { poolCount.innerHTML = '—'; }
}

const debouncedPool = debounce(updatePoolCount, 450);

// ---- Render carta ----
function buildCardHTML(player, idx) {
  const tier = cardTier(player.overall);
  const statsHTML = Object.entries(player.stats).map(([lbl, val]) => `
    <div class="stat-item">
      <span class="stat-val" style="color:${statColor(val)}">${val}</span>
      <span class="stat-lbl">${lbl}</span>
    </div>`).join('');

  const imgHTML = player.face_url
    ? `<img src="${player.face_url}" alt="${player.name}" loading="lazy" crossorigin="anonymous" onerror="this.style.display='none'">`
    : `<span style="font-size:3.2rem;opacity:0.5">⚽</span>`;

  return `
    <div class="card-wrapper" data-idx="${idx}" style="animation-delay:${idx*0.11}s">
      <div class="card-inner">
        <div class="card-face card-back"><span class="back-logo">⚽</span></div>
        <div class="card-face card-front ${tier}">
          <div class="card-header">
            <div>
              <div class="card-ovr">${player.overall}</div>
              <div class="card-pos">${player.position}</div>
            </div>
          </div>
          <div class="card-img-wrap">${imgHTML}</div>
          <div class="card-name">${player.name}</div>
          <div class="card-club">${player.club}</div>
          <div class="card-divider"></div>
          <div class="card-stats">${statsHTML}</div>
          <div class="card-shine"></div>
        </div>
      </div>
    </div>`;
}

// ---- Render griglia con barra azioni ----
function renderPack(players) {
  state.revealedCount = 0;

  const bar = document.createElement('div');
  bar.className = 'action-bar';
  bar.id = 'action-bar';
  bar.innerHTML = `
    <button class="btn-action btn-reveal" id="btn-reveal-all" onclick="revealAll()">⚡ Rivela tutte</button>
    <button class="btn-action btn-share-dl" id="btn-dl" onclick="shareDownload()">📥 Salva immagine</button>
    <button class="btn-action btn-share-wa" onclick="shareWhatsApp()">💬 WhatsApp</button>
    <button class="btn-action btn-share-email" onclick="shareEmail()">📧 Email</button>`;

  const grid = document.createElement('div');
  grid.className = 'cards-grid';
  grid.id = 'cards-grid';
  grid.innerHTML = players.map((p, i) => buildCardHTML(p, i)).join('');

  playArea.innerHTML = '';
  playArea.appendChild(bar);
  playArea.appendChild(grid);

  grid.querySelectorAll('.card-wrapper').forEach(el => {
    el.addEventListener('click', () => revealCard(el));
  });
}

// ---- Reveal ----
function revealCard(wrapper) {
  if (wrapper.classList.contains('revealed')) return;
  wrapper.classList.add('revealed');
  state.revealedCount++;
  const shine = wrapper.querySelector('.card-shine');
  if (shine) setTimeout(() => shine.remove(), 900);
  if (state.revealedCount >= state.currentPack.length) {
    const btn = $('btn-reveal-all');
    if (btn) btn.classList.add('hidden');
  }
}

function revealAll() {
  document.querySelectorAll('.card-wrapper:not(.revealed)').forEach((w, i) => {
    setTimeout(() => revealCard(w), i * 160);
  });
  const btn = $('btn-reveal-all');
  if (btn) btn.classList.add('hidden');
}

// ---- Apertura pacchetto ----
async function openPack() {
  if (state.isLoading) return;
  state.isLoading = true;
  btnOpen.disabled = true;
  playArea.innerHTML = `
    <div class="loader">
      <div class="spinner"></div>
      <span>Generazione pacchetto...</span>
    </div>`;

  try {
    const cfg = getConfig();
    const res = await fetch('/api/pack/open', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Errore HTTP ${res.status}`);
    state.currentPack = data.players;
    renderPack(data.players);
  } catch (err) {
    playArea.innerHTML = `<div class="error-msg">⚠️ ${err.message}</div>`;
  } finally {
    state.isLoading = false;
    btnOpen.disabled = false;
  }
}

// ================================================================
//  FEATURE 2 — CONDIVISIONE IMMAGINE
// ================================================================

async function capturePackImage() {
  // Prima rivela tutte le carte
  document.querySelectorAll('.card-wrapper:not(.revealed)').forEach(w => {
    w.classList.add('revealed');
    const shine = w.querySelector('.card-shine');
    if (shine) shine.remove();
  });

  const overlay = document.createElement('div');
  overlay.className = 'capture-overlay';
  overlay.innerHTML = '<div class="spinner"></div><span>Generazione immagine...</span>';
  document.body.appendChild(overlay);

  // Crea un container temporaneo con sfondo per la cattura
  const captureWrap = document.createElement('div');
  captureWrap.style.cssText = `
    position:fixed; left:-9999px; top:0;
    background:#0a0a14; padding:24px 20px 20px;
    border-radius:16px;
  `;

  // Header brandizzato
  const header = document.createElement('div');
  header.style.cssText = 'text-align:center;margin-bottom:18px;';
  header.innerHTML = `<span style="color:#f0d080;font-size:1.2rem;font-weight:700;letter-spacing:2px;font-family:Segoe UI,sans-serif">⚽ FC26 PACK OPENER</span>`;
  captureWrap.appendChild(header);

  // Clone della griglia
  const gridClone = $('cards-grid').cloneNode(true);
  gridClone.style.cssText = 'display:flex;flex-wrap:wrap;gap:14px;justify-content:center;max-width:1000px;';
  // Rimuovi le animazioni dal clone
  gridClone.querySelectorAll('.card-wrapper').forEach(w => {
    w.style.animation = 'none';
    w.style.perspective = 'none';
  });
  gridClone.querySelectorAll('.card-inner').forEach(el => {
    el.style.transform = 'none';
    el.style.transformStyle = 'flat';
  });
  gridClone.querySelectorAll('.card-face.card-back').forEach(el => {
    el.style.display = 'none';
  });
  gridClone.querySelectorAll('.card-face.card-front').forEach(el => {
    el.style.position = 'relative';
    el.style.backfaceVisibility = 'visible';
  });
  captureWrap.appendChild(gridClone);

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'text-align:center;margin-top:14px;color:#9090b0;font-size:0.7rem;font-family:Segoe UI,sans-serif;';
  footer.textContent = APP_URL;
  captureWrap.appendChild(footer);

  document.body.appendChild(captureWrap);

  // Aspetta che le immagini si carichino
  await new Promise(r => setTimeout(r, 600));

  try {
    const canvas = await html2canvas(captureWrap, {
      backgroundColor: '#0a0a14',
      useCORS: true,
      allowTaint: true,
      scale: 2,
      logging: false,
    });
    return canvas;
  } finally {
    document.body.removeChild(captureWrap);
    document.body.removeChild(overlay);
  }
}

async function shareDownload() {
  try {
    const canvas = await capturePackImage();
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.download = 'fc26-pack.png';
    a.href = url;
    a.click();
  } catch (err) {
    alert('Errore nella generazione immagine: ' + err.message);
  }
}

function shareWhatsApp() {
  const text = `🎮 Ho appena aperto un pacchetto FC26!\n🎁 Prova anche tu: ${APP_URL}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function shareEmail() {
  const subject = 'Il mio pacchetto FC26!';
  const body = `Guarda il pacchetto che ho appena aperto su FC26 Pack Opener!\n\n🎁 Prova anche tu: ${APP_URL}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---- Validazione range OVR ----
function bindOvrValidation() {
  inpOvrMin.addEventListener('change', () => {
    const mn = parseInt(inpOvrMin.value), mx = parseInt(inpOvrMax.value);
    if (mn > mx) inpOvrMax.value = mn;
    debouncedPool();
  });
  inpOvrMax.addEventListener('change', () => {
    const mn = parseInt(inpOvrMin.value), mx = parseInt(inpOvrMax.value);
    if (mx < mn) inpOvrMin.value = mx;
    debouncedPool();
  });
}

// ---- Utility ----
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---- Init ----
function init() {
  // Particelle di sfondo
  const container = document.createElement('div');
  container.className = 'particles';
  document.body.prepend(container);
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (6 + Math.random() * 10) + 's';
    p.style.animationDelay = (Math.random() * 12) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    container.appendChild(p);
  }

  buildStatFilters();
  btnOpen.addEventListener('click', openPack);

  selPosition.addEventListener('change', () => {
    buildStatFilters();
    debouncedPool();
  });
  togGk.addEventListener('change', debouncedPool);
  inpNumCards.addEventListener('input', debouncedPool);
  bindOvrValidation();
  updatePoolCount();
}

document.addEventListener('DOMContentLoaded', init);

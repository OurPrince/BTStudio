/**
 * content.js — BTStudio v4.0
 * world: ISOLATED, run_at: document_start
 *
 * 1. Injects "BTStudio" card into AI Studio right sidebar
 * 2. Creates modal dialog for settings
 * 3. Chat optimizer (Smart / Hard)
 * 4. Bypass mode switching (Angular / DOM / Off)
 */

// ── State ────────────────────────────────────────────────────────────────────
let state = {
  bypassEnabled: true,
  bypassMode: 'angular',  // 'angular' | 'dom'
  optimizerEnabled: false,
  optimizerMode: 'smart', // 'smart' | 'hard'
  keepLast: 12,
  autoKeep: true,
  scrollBottomEnabled: true,
};

let injected = false;
let modalEl = null;
let observerInterval = null;

// ── Init: load state + wait for DOM ──────────────────────────────────────────
chrome.storage.local.get(['btsState'], (data) => {
  if (data.btsState) Object.assign(state, data.btsState);
  syncBypassToggle();
  startAutoOptimizer();
  waitForSidebar();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.btsState) {
    Object.assign(state, changes.btsState.newValue);
    syncBypassToggle();
    startAutoOptimizer();
  }
});

// Listen for background requests to open the panel
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'openBTStudio') openModal();
});

// Watch for SPA URL changes (e.g., navigating to a new chat)
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Clear optimizer cache
    detachedTurns = [];
    detachedParent = null;
    // Clear DOM bypass cache
    if (typeof latestMarkdown !== 'undefined') {
      latestMarkdown = '';
      sseBuffer = '';
      restoredTurnIds.clear();
      if (typeof detachedTurns !== 'undefined') detachedTurns = [];
      if (typeof detachedParent !== 'undefined') detachedParent = null;
    }
    console.log('[BTStudio] SPA navigation detected. State cleared.');
  }
}, 500);

// ── Sync bypass on/off to interceptor.js (MAIN world) ────────────────────────
function syncBypassToggle() {
  const enabled = state.bypassEnabled && state.bypassMode === 'angular';
  window.dispatchEvent(new CustomEvent('__aisu_toggle', { detail: enabled }));
}

function saveState() {
  try {
    if (chrome.runtime && chrome.runtime.id) {
      chrome.storage.local.set({ btsState: state });
    }
  } catch (e) {
    console.warn('[BTStudio] Warn: Extension context invalidated, state not saved. Please hard refresh (F5).');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DOM Injection — wait for sidebar to appear
// ═══════════════════════════════════════════════════════════════════
function waitForSidebar() {
  if (injected) return;

  const tryInject = () => {
    // Find the container: ms-system-instructions-panel is the most stable target now
    const anchor = document.querySelector('ms-system-instructions-panel');
    if (!anchor) return false;

    // Don't inject twice
    if (document.querySelector('.bts-sidebar-btn')) {
      return true;
    }

    // Create the card
    const card = document.createElement('button');
    card.className = 'bts-sidebar-btn';
    card.setAttribute('aria-label', 'BTStudio Settings');
    card.innerHTML = `
      <div class="title-container" style="display:flex; align-items:center; gap:8px;">
        <span class="title" style="margin:0;">BTStudio</span>
        <span class="badge new" style="margin:0;"><span class="badge-dot"></span>Extension Settings</span>
      </div>
      <span class="subtitle">Performance & Content Bypass</span>
    `;
    card.addEventListener('click', () => openModal());

    // Insert after System Instructions
    anchor.insertAdjacentElement('afterend', card);
    injected = true;

    console.log(
      '%c[BTStudio] ⚡ Panel injected into sidebar',
      'color:#87a9ff;font-weight:bold'
    );
    return true;
  };

  // Retry until sidebar loads (Angular is lazy)
    const obs = new MutationObserver(() => {
      tryInject();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
}

// ═══════════════════════════════════════════════════════════════════
//  Modal Dialog
// ═══════════════════════════════════════════════════════════════════
function openModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }

  const turnCount = document.querySelectorAll('ms-chat-turn').length;

  const overlay = document.createElement('div');
  overlay.className = 'bts-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  overlay.innerHTML = `
    <div class="bts-dialog">
      <div class="bts-dialog-header">
        <h2>BTStudio Settings</h2>
        <button class="bts-close-btn" id="bts-close" aria-label="Close">
          <span class="material-symbols-outlined notranslate" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="bts-dialog-body">

        <!-- BYPASS SECTION -->
        <div class="bts-section">
          <div class="bts-header-row">
            <div class="bts-header-text">
               <div class="bts-section-title">CONTENT BYPASS</div>
               <div class="bts-section-desc">Bypass content filters and blocked response streams.</div>
            </div>
            <button class="bts-auto-toggle ${state.bypassEnabled ? 'active' : ''}" id="bts-bypass-master"></button>
          </div>

          <div class="bts-mode-list ${!state.bypassEnabled ? 'disabled' : ''}" id="bts-bypass-cards">
            <button class="bts-mode-row ${state.bypassMode === 'angular' ? 'selected' : ''}" data-mode="angular">
              <div class="row-header">
                <div class="row-header-text">
                  <div class="model-title">
                    <span class="model-title-text">Intercept (Native)</span>
                    <span class="badge new"><span class="badge-dot"></span>Recommended</span>
                  </div>
                  <span class="model-subtitle">zero-flicker-network-interception</span>
                </div>
              </div>
              <div class="model-details">
                <ul>
                  <li class="model-carousel-row-detail"><span class="material-symbols-outlined notranslate">rocket_launch</span> Intercepts the network stream before Angular processes it.</li>
                  <li class="model-carousel-row-detail"><span class="material-symbols-outlined notranslate">bolt</span> Instant restoration without screen flicker. Efficient & seamless.</li>
                </ul>
              </div>
            </button>

            <div class="bts-row-divider"></div>

            <button class="bts-mode-row ${state.bypassMode === 'dom' ? 'selected' : ''}" data-mode="dom">
              <div class="row-header">
                <div class="row-header-text">
                  <div class="model-title">
                    <span class="model-title-text">Restore (Legacy)</span>
                  </div>
                  <span class="model-subtitle">mutation-observer-restoration</span>
                </div>
              </div>
              <div class="model-details">
                <ul>
                  <li class="model-carousel-row-detail"><span class="material-symbols-outlined notranslate">visibility</span> Monitors the DOM for changes and blocked content.</li>
                  <li class="model-carousel-row-detail"><span class="material-symbols-outlined notranslate">edit</span> Programmatically simulates Edit \u2192 Paste \u2192 Save automatically.</li>
                </ul>
              </div>
            </button>
          </div>
        </div>

        <div class="bts-divider"></div>

        <!-- OPTIMIZER SECTION -->
        <div class="bts-section">
          <div class="bts-header-row">
            <div class="bts-header-text">
               <div class="bts-section-title">CHAT OPTIMIZER</div>
               <div class="bts-section-desc">Remove old chat turns from memory to eliminate UI lag.</div>
            </div>
            <button class="bts-auto-toggle ${state.optimizerEnabled ? 'active' : ''}" id="bts-optimizer-master"></button>
          </div>

          <div class="bts-mode-list ${!state.optimizerEnabled ? 'disabled' : ''}" id="bts-optimizer-cards">
            <div class="bts-turn-counter">
              <span>Active turns in DOM:</span>
              <span class="bts-count-num">${turnCount}</span>
            </div>

            <button class="bts-mode-row ${state.optimizerMode === 'smart' ? 'selected' : ''}" data-mode="smart">
              <div class="row-header">
                <div class="row-header-text">
                  <div class="model-title">
                    <span class="model-title-text">Buffered (Safe)</span>
                    <span class="badge paid"><span class="badge-dot"></span>Smart Hiding</span>
                  </div>
                  <span class="model-subtitle">auto-detach-on-overflow</span>
                </div>
              </div>
              <div class="model-details">
                <ul>
                  <li class="model-carousel-row-detail"><span class="material-symbols-outlined notranslate">visibility_off</span> Hides old messages from the DOM but keeps them in memory.</li>
                  <li class="model-carousel-row-detail"><span class="material-symbols-outlined notranslate">history</span> Instantly restore previous context via the "Restore" button.</li>
                </ul>
              </div>
            </button>

            <div class="bts-row-divider"></div>

            <button class="bts-mode-row ${state.optimizerMode === 'hard' ? 'selected' : ''}" data-mode="hard">
              <div class="row-header">
                <div class="row-header-text">
                  <div class="model-title">
                    <span class="model-title-text">Physical (Aggressive)</span>
                    <span class="badge danger"><span class="badge-dot"></span>Deleting</span>
                  </div>
                  <span class="model-subtitle">permanent-memory-cleanup</span>
                </div>
              </div>
              <div class="model-details">
                <ul>
                  <li class="model-carousel-row-detail"><span class="material-symbols-outlined notranslate">delete</span> Permanently removes old messages from the browser session.</li>
                  <li class="model-carousel-row-detail"><span class="material-symbols-outlined notranslate">speed</span> Peak performance for extremely long chat sessions.</li>
                </ul>
              </div>
            </button>

            <!-- Slider panel -->
            <div class="bts-slider-panel ${state.optimizerMode === 'hard' ? 'active' : ''}" id="bts-slider-panel">
              <div class="bts-auto-row">
                <button class="bts-auto-toggle ${state.autoKeep ? 'active' : ''}" id="bts-auto-toggle"></button>
                <span>Auto-Limit (Recommended for large prompts)</span>
              </div>
              <div class="bts-slider-row">
                <span class="bts-slider-label">Keep last</span>
                <input type="range" class="bts-range" id="bts-keep-slider"
                       min="2" max="${Math.max(turnCount + 10, 50)}" value="${state.keepLast}"
                       ${state.autoKeep ? 'disabled' : ''}>
                <span class="bts-slider-value" id="bts-keep-value">${state.keepLast}</span>
              </div>
              <button class="bts-apply-btn destructive" id="bts-apply">Enforce Physical Cleanup</button>
            </div>
          </div>
        </div>
        <div class="bts-divider"></div>

        <!-- MODULES SECTION -->
        <div class="bts-section">
          <div class="bts-header-row">
            <div class="bts-header-text">
               <div class="bts-section-title">MODULES</div>
               <div class="bts-section-desc">Extra UI features to enhance AI Studio experience.</div>
            </div>
          </div>
          <div class="bts-mode-list" id="bts-modules">
            <button class="bts-mode-row ${state.scrollBottomEnabled ? 'selected' : ''}" id="bts-scroll-toggle-btn">
              <div class="row-header">
                <div class="row-header-text">
                  <div class="model-title">
                    <span class="model-title-text">Scroll to Bottom Button</span>
                  </div>
                  <span class="model-subtitle">Shows a button to jump back down.</span>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="bts-divider"></div>

        <a href="https://send.monobank.ua/jar/ARDckyv3B4" target="_blank" class="bts-donation-card">
           <div class="donation-icon">
              <span class="material-symbols-outlined notranslate">favorite</span>
           </div>
           <div class="donation-content">
              <div class="donation-title">Support Project</div>
              <div class="donation-desc">If BTStudio helps, consider supporting development.</div>
           </div>
        </a>

        <div class="bts-footer">
          Unofficial extension. Not affiliated with Google or AI Studio.
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  modalEl = overlay;

  // Initialize smooth JS animation for the donation card
  const donationCard = overlay.querySelector('.bts-donation-card');
  if (donationCard) {
    initDonationAnimation(donationCard);
  }

  // Wire up events
  overlay.querySelector('#bts-close').addEventListener('click', closeModal);

  // Master Toggle: Bypass
  const bypassMaster = overlay.querySelector('#bts-bypass-master');
  bypassMaster.addEventListener('click', () => {
    state.bypassEnabled = !state.bypassEnabled;
    bypassMaster.classList.toggle('active', state.bypassEnabled);
    overlay.querySelector('#bts-bypass-cards').classList.toggle('disabled', !state.bypassEnabled);
    saveState();
    syncBypassToggle();
  });

  // Master Toggle: Optimizer
  const optiMaster = overlay.querySelector('#bts-optimizer-master');
  optiMaster.addEventListener('click', () => {
    state.optimizerEnabled = !state.optimizerEnabled;
    optiMaster.classList.toggle('active', state.optimizerEnabled);
    overlay.querySelector('#bts-optimizer-cards').classList.toggle('disabled', !state.optimizerEnabled);
    saveState();
    if (state.optimizerEnabled) startAutoOptimizer();
    else stopAutoOptimizer();
  });

  // Bypass mode cards
  overlay.querySelectorAll('#bts-bypass-cards .bts-mode-row').forEach(card => {
    card.addEventListener('click', () => {
      if (!state.bypassEnabled) return;
      state.bypassMode = card.dataset.mode;
      saveState();
      syncBypassToggle();
      refreshCardSelection('#bts-bypass-cards');
    });
  });

  // Optimizer mode cards
  overlay.querySelectorAll('#bts-optimizer-cards .bts-mode-row').forEach(card => {
    card.addEventListener('click', () => {
      if (!state.optimizerEnabled) return;
      state.optimizerMode = card.dataset.mode;
      saveState();
      refreshCardSelection('#bts-optimizer-cards');
      refreshSliderPanel();

      if (state.optimizerMode === 'smart') {
        startAutoOptimizer();
      }
    });
  });

  // Auto toggle (Keep slider)
  const autoToggle = overlay.querySelector('#bts-auto-toggle');
  autoToggle.addEventListener('click', () => {
    if (!state.optimizerEnabled) return;
    state.autoKeep = !state.autoKeep;
    autoToggle.classList.toggle('active', state.autoKeep);
    const slider = overlay.querySelector('#bts-keep-slider');
    if (slider) {
      slider.disabled = state.autoKeep;
      if (state.autoKeep) {
        state.keepLast = 10;
        slider.value = state.keepLast;
        overlay.querySelector('#bts-keep-value').textContent = state.keepLast;
        updateSliderFill(slider);
      }
    }
    saveState();
  });

  // Keep slider
  const slider = overlay.querySelector('#bts-keep-slider');
  if (slider) {
    updateSliderFill(slider);
    slider.addEventListener('input', () => {
      state.keepLast = parseInt(slider.value);
      overlay.querySelector('#bts-keep-value').textContent = state.keepLast;
      updateSliderFill(slider);
      saveState();
    });
  }

  // Apply button (Hard mode only)
  overlay.querySelector('#bts-apply').addEventListener('click', () => {
    if (!state.optimizerEnabled) return;
    applyOptimizer();
    startAutoOptimizer();
    const newCount = document.querySelectorAll('ms-chat-turn').length;
    const counter = overlay.querySelector('.bts-count-num');
    if (counter) counter.textContent = newCount;
  });

  // Master Toggle: Modules (Scroll)
  const scrollToggle = overlay.querySelector('#bts-scroll-toggle-btn');
  scrollToggle.addEventListener('click', () => {
    state.scrollBottomEnabled = !state.scrollBottomEnabled;
    scrollToggle.classList.toggle('selected', state.scrollBottomEnabled);
    saveState();
  });

  // Live update turn count
  startTurnCounter();

  // Close on Escape
  document.addEventListener('keydown', escHandler);
}

function closeModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
  document.removeEventListener('keydown', escHandler);
  stopTurnCounter();
}

function escHandler(e) {
  if (e.key === 'Escape') closeModal();
}

function refreshCardSelection(containerSelector) {
  if (!modalEl) return;
  const container = modalEl.querySelector(containerSelector);
  const mode = containerSelector.includes('bypass') ? state.bypassMode : state.optimizerMode;
  container.querySelectorAll('.bts-mode-row').forEach(card => {
    card.classList.toggle('selected', card.dataset.mode === mode);
  });
}

function refreshSliderPanel() {
  if (!modalEl) return;
  const panel = modalEl.querySelector('#bts-slider-panel');
  panel.classList.toggle('active', state.optimizerMode === 'hard');
}

function updateSliderFill(slider) {
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const val = parseFloat(slider.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--bts-fill', pct + '%');
}

// ═══════════════════════════════════════════════════════════════════
//  Turn Counter (live)
// ═══════════════════════════════════════════════════════════════════
function startTurnCounter() {
  stopTurnCounter();
  observerInterval = setInterval(() => {
    if (!modalEl) return;
    const count = document.querySelectorAll('ms-chat-turn').length;
    const el = modalEl.querySelector('#bts-turn-count');
    if (el) el.textContent = count;

    // Update slider max
    const slider = modalEl.querySelector('#bts-keep-slider');
    if (slider) slider.max = Math.max(count, 2);
  }, 2000);
}

function stopTurnCounter() {
  if (observerInterval) {
    clearInterval(observerInterval);
    observerInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Chat Optimizer Logic
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  Chat Optimizer Logic (High-Performance CSS Virtual Scroller)
// ═══════════════════════════════════════════════════════════════════

// The virtual scroller completely fixes Angular reflow lags by applying `display: none`
// strictly to off-screen elements while physically maintaining spacing. It requires NO 
// fragile DOM detachment logic.

let scrollObserver = null;
let btsInterval = null;

let detachedTurns = [];
let detachedParent = null;

let _lastKnownTurnCount = 0;
let _userForceRestored = false;
let _userForceRestoredTime = 0;
let _userStartedReading = false;
let _lastScrollTime = 0;

function applyOptimizer() {
  if (!state.optimizerEnabled) return;
  if (Date.now() - _lastScrollTime < 500) return; // Wait for scroll to stop to prevent engine clashing
  
  const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
  if (!turns.length) return;

  const keep = state.autoKeep ? 15 : parseInt(state.keepLast, 10);

  if (state.optimizerMode === 'hard') {
    const cutoff = Math.max(0, turns.length - keep);
    let removed = 0;
    for (let i = 0; i < cutoff; i++) {
        if (!turns[i].hasAttribute('data-bts-hard-rem')) {
            turns[i].setAttribute('data-bts-hard-rem', 'true');
            turns[i].remove();
            removed++;
        }
    }
    return;
  }

  if (state.optimizerMode === 'smart') {
    // Detect new generations
    if (turns.length > _lastKnownTurnCount) {
        _userForceRestored = false;
        _userStartedReading = false;
        _lastKnownTurnCount = turns.length;
    } else if (turns.length < _lastKnownTurnCount && turns.length > keep) {
        _lastKnownTurnCount = turns.length; // Handle manual user deletions
    }

    if (turns.length <= keep) return;
    
    // Find the actual scrollable container
    let scroller = (function findScroller(el) {
        if (!el) return null;
        if (el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'hidden') return el;
        return findScroller(el.parentElement);
    })(turns[0]);

    if (!scroller) {
        scroller = document.querySelector('ms-autoscroll-container div') || document.querySelector('ms-autoscroll-container');
    }

    if (!scroller) return;

    let isAtBottom = (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) <= 600;

    // Smart Auto-Hide logic (State machine for 'Reading then returning')
    if (_userForceRestored) {
        const now = Date.now();
        const timeSinceRestore = now - _userForceRestoredTime;

        // Give 1.5s grace period for layout to settle
        if (timeSinceRestore > 1500) {
            // 2. Identify if they actually went UP to read something
            if (scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight - 600) {
                _userStartedReading = true;
            }
            
            // 3. Re-engage cleanup if:
            //    - They were reading and now returned to bottom
            //    - OR they stayed at the bottom for more than 3 seconds total (they are done with history)
            if ((_userStartedReading && isAtBottom) || (isAtBottom && timeSinceRestore > 3000)) {
                _userForceRestored = false;
                _userStartedReading = false;
            } else {
                return; // Still reading or in specific history view
            }
        } else {
            return; // Grace period active
        }
    }

    // Only optimize if user is actively writing at the bottom.
    if (isAtBottom) {
        if (!detachedParent && turns[0].parentNode) {
            detachedParent = turns[0].parentNode;
        }

        let removed = 0;
        const cutoff = turns.length - keep;
        for (let i = 0; i < cutoff; i++) {
            detachedTurns.push(turns[i]);
            turns[i].remove();
            removed++;
        }

        if (removed > 0) {
            injectLoadBanner();
        }
    }
  } else {
    // Off mode
    restoreDetached();
  }
}

function injectLoadBanner() {
    if (!detachedParent || detachedTurns.length === 0) return;
    let banner = document.querySelector('.bts-load-banner');
    
    if (!banner) {
        banner = document.createElement('div');
        banner.className = 'bts-load-banner';
        detachedParent.insertBefore(banner, detachedParent.firstChild);
    }

    // Capture state to avoid unnecessary DOM thrashing
    const currentCount = detachedTurns.length;
    const bannerState = banner.getAttribute('data-count');
    if (bannerState === currentCount.toString()) return;
    
    banner.setAttribute('data-count', currentCount);
    banner.innerHTML = '';

    // 1. "Restore Everything" button
    const btnAll = document.createElement('button');
    btnAll.textContent = `Restore Everything (${currentCount} hidden)`;
    btnAll.addEventListener('click', () => restoreDetached());
    banner.appendChild(btnAll);

    // 2. "Restore +20" button (only if enough hidden)
    if (currentCount > 20) {
        const btnPartial = document.createElement('button');
        btnPartial.textContent = `Restore +20`;
        btnPartial.addEventListener('click', () => restoreDetached(20));
        banner.appendChild(btnPartial);
    }
}

function restoreDetached(amount) {
    _userForceRestored = true;
    _userForceRestoredTime = Date.now();
    _userStartedReading = false;

    // Check if amount is actually a number (not event object)
    let countToRestore = (typeof amount === 'number') ? amount : detachedTurns.length;

    const banner = document.querySelector('.bts-load-banner');
    const anchor = detachedParent ? detachedParent.querySelector('ms-chat-turn') : null;
    
    // Find the actual scrollable container
    let scroller = (function findScroller(el) {
        if (!el) return null;
        if (el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'hidden') return el;
        return findScroller(el.parentElement);
    })(anchor || document.querySelector('ms-chat-turn'));

    if (!scroller) {
        scroller = document.querySelector('ms-autoscroll-container div') || document.querySelector('ms-autoscroll-container');
    }

    if (!detachedTurns.length || !detachedParent) {
        if (banner) banner.remove();
        _lastKnownTurnCount = document.querySelectorAll('ms-chat-turn').length;
        return;
    }

    // Capture position before insertion
    const prevOffset = anchor ? anchor.getBoundingClientRect().top : 0;

    // Determine turns to restore (take from the end as they are the most recent)
    let toRestore;
    if (countToRestore >= detachedTurns.length) {
        toRestore = detachedTurns;
        detachedTurns = [];
        if (banner) banner.remove();
    } else {
        toRestore = detachedTurns.splice(detachedTurns.length - countToRestore, countToRestore);
        injectLoadBanner(); // Update banner with new count
    }

    // Insert history
    toRestore.forEach(el => {
        if (anchor) {
            detachedParent.insertBefore(el, anchor);
        } else {
            detachedParent.appendChild(el);
        }
    });

    _lastKnownTurnCount = document.querySelectorAll('ms-chat-turn').length;

    const doFix = () => {
        if (scroller && anchor) {
            const newOffset = anchor.getBoundingClientRect().top;
            const diff = newOffset - prevOffset;
            scroller.scrollTop += diff;
        }
    };

    doFix(); 
    setTimeout(doFix, 10);
}

function startAutoOptimizer() {
  stopAutoOptimizer();
  if (!state.optimizerEnabled) return;

  // 1. Diagnostics frequency: 600ms check is optimal for React/Angular SPAs
  btsInterval = setInterval(() => {
     if (state.optimizerMode === 'smart') applyOptimizer();
  }, 600);
}

function stopAutoOptimizer() {
  if (btsInterval) {
    clearInterval(btsInterval);
    btsInterval = null;
  }
}


// ── Startup log ─────────────────────────────────────────────────────────────
console.log(
  '%c[BTStudio] ⚡ v4.0 loaded',
  'color:#87a9ff;font-weight:bold;font-size:12px'
);

// ═══════════════════════════════════════════════════════════════════
//  Legacy DOM Bypass fallback
// ═══════════════════════════════════════════════════════════════════
function domToMarkdown(rootElement) {
  function collectListItems(listNode) {
    const items = [];
    const search = (parent) => {
      for (const child of parent.children) {
        const t = child.tagName.toLowerCase();
        if (t === 'li') items.push(child);
        else if (t !== 'ol' && t !== 'ul') search(child);
      }
    };
    search(listNode);
    return items;
  }

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.classList && node.classList.contains('author-label')) return '';

    const tag = node.tagName.toLowerCase();
    const style = node.getAttribute('style') || '';
    const ch = () => Array.from(node.childNodes).map(walk).join('');

    switch (tag) {
      case 'h1': return `# ${ch().trim()}\n\n`;
      case 'h2': return `## ${ch().trim()}\n\n`;
      case 'h3': return `### ${ch().trim()}\n\n`;
      case 'h4': return `#### ${ch().trim()}\n\n`;
      case 'h5': return `##### ${ch().trim()}\n\n`;
      case 'h6': return `###### ${ch().trim()}\n\n`;
      case 'strong': case 'b': return `**${ch()}**`;
      case 'em': case 'i': return `*${ch()}*`;
      case 's': case 'del': return `~~${ch()}~~`;
      case 'code': {
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') return node.textContent;
        return '`' + node.textContent + '`';
      }
      case 'pre': {
        const codeEl = node.querySelector('code');
        const lang = codeEl ? (codeEl.className.match(/language-(\S+)/) || [])[1] || '' : '';
        const code = codeEl ? codeEl.textContent : node.textContent;
        return '```' + lang + '\n' + code + '\n```\n\n';
      }
      case 'blockquote': return ch().split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
      case 'ul': {
        const items = collectListItems(node);
        return items.map(li => {
          const c = walk(li).replace(/^\n+/, '').replace(/\n+$/, '');
          return `- ${c.replace(/\n/g, '\n  ')}`;
        }).join('\n') + '\n\n';
      }
      case 'ol': {
        const items = collectListItems(node);
        return items.map((li, idx) => {
          const c = walk(li).replace(/^\n+/, '').replace(/\n+$/, '');
          const pfx = `${idx + 1}. `;
          return `${pfx}${c.replace(/\n/g, '\n' + ' '.repeat(pfx.length))}`;
        }).join('\n') + '\n\n';
      }
      case 'li': return ch();
      case 'a': {
        const href = node.getAttribute('href') || '';
        return href ? `[${ch()}](${href})` : ch();
      }
      case 'img': return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
      case 'hr': return '---\n\n';
      case 'br': return '\n';
      case 'p': return `${ch()}\n\n`;
      case 'table': {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (!rows.length) return ch();
        const fmt = tr => '| ' + Array.from(tr.querySelectorAll('th,td'))
          .map(c => c.innerText.replace(/\n/g, ' ')).join(' | ') + ' |';
        const head = fmt(rows[0]);
        const sep = '| ' + Array.from(rows[0].querySelectorAll('th,td')).map(() => '---').join(' | ') + ' |';
        return `${head}\n${sep}\n${rows.slice(1).map(fmt).join('\n')}\n\n`;
      }
      case 'span': {
        let content = ch();
        if (/font-weight\s*:\s*(bold|[7-9]\d{2})/.test(style)) content = `**${content}**`;
        if (/font-style\s*:\s*italic/.test(style)) content = `*${content}*`;
        if (/text-decoration[^:]*:\s*[^;]*line-through/.test(style)) content = `~~${content}~~`;
        return content;
      }
      case 'ms-thought-chunk': return ''; // skip thoughts
      default: return ch();
    }
  }

  return walk(rootElement).replace(/\n{3,}/g, '\n\n').trim();
}

function restoreViaEdit(turnContentEl, markdown) {
  const container = turnContentEl.closest('.chat-turn-container');
  if (!container) return;

  const editBtn = container.querySelector('button.toggle-edit-button');
  if (!editBtn) return;

  editBtn.click();

  let attempts = 0;
  const maxAttempts = 30;

  const waitForTextarea = () => {
    attempts++;
    const textarea = container.querySelector('ms-autosize-textarea textarea');

    if (!textarea) {
      if (attempts < maxAttempts) setTimeout(waitForTextarea, 100);
      return;
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(textarea, markdown);

    const autosizeEl = container.querySelector('ms-autosize-textarea');
    if (autosizeEl) autosizeEl.setAttribute('data-value', markdown);

    textarea.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    textarea.dispatchEvent(new Event('blur',   { bubbles: true, cancelable: true }));

    setTimeout(() => {
      const saveBtn = container.querySelector('button.toggle-edit-button');
      if (saveBtn) saveBtn.click();
    }, 500);
  };

  waitForTextarea();
}

let latestMarkdown  = "";
let latestSaveTime  = 0;
let restoredTurnIds = new Set();
let isRestoring     = false;

let sseBuffer    = "";
let sseSaveTime  = 0;

window.addEventListener('__aisu_xhrCapture', (e) => {
  const text = e.detail.text || '';
  sseBuffer   = text;
  sseSaveTime = e.detail.ts || Date.now();
  console.log(
    `%c[BTStudio] 📡 XHR snap: ${text.length} chars (trigger: ${e.detail.trigger})`,
    'color:#4fc3f7'
  );
});

const FRESHNESS_WINDOW = 15000;

const domObserver = new MutationObserver(() => {
  if (isRestoring || state.bypassMode !== 'dom') return;

  const turnContainers = document.querySelectorAll('.turn-content');
  if (!turnContainers.length) return;
  const currentTurn = turnContainers[turnContainers.length - 1];
  
  const chatTurn = currentTurn.closest('ms-chat-turn');
  const turnId = chatTurn ? chatTurn.id : null;

  const warningIcon = currentTurn.querySelector('span.material-symbols-outlined');
  const isBlocked   = warningIcon && warningIcon.textContent.includes('warning');

  if (!isBlocked) {
    const textChunk = currentTurn.querySelector('.text-chunk');
    if (!textChunk) return;

    const cmarkNode      = textChunk.querySelector('ms-cmark-node.cmark-node');
    const hasOnlyThoughts = !!textChunk.querySelector('ms-thought-chunk') &&
                            !textChunk.querySelector('ms-text-chunk > ms-cmark-node');
    if (!cmarkNode || hasOnlyThoughts) return;

    const md = domToMarkdown(textChunk);
    const isFlattenedThoughts = md.includes('Expand to view model thoughts') ||
                                md.includes('gstatic.com/aistudio/watermark')  ||
                                md.includes('chevron_right');
    if (!isFlattenedThoughts) {
      latestMarkdown = md;
      latestSaveTime = Date.now();
    }
  } else {
    // Block detected
    const textChunk = currentTurn.querySelector('.text-chunk');
    const isThoughtsOnlyBlock = textChunk &&
      !!textChunk.querySelector('ms-thought-chunk') &&
      !textChunk.querySelector('ms-text-chunk > ms-cmark-node');
    if (isThoughtsOnlyBlock) return;

    if (turnId && restoredTurnIds.has(turnId)) return;

    const now      = Date.now();
    const domFresh = !!latestMarkdown  && (now - latestSaveTime) < FRESHNESS_WINDOW;
    const sseFresh = !!sseBuffer       && (now - sseSaveTime)    < FRESHNESS_WINDOW;

    const useSSE = (!domFresh || latestMarkdown.length < 60) && sseFresh;
    const md     = useSSE ? sseBuffer : (domFresh ? latestMarkdown : null);

    if (!md) return;

    latestMarkdown = "";
    sseBuffer      = "";
    isRestoring    = true;
    if (turnId) restoredTurnIds.add(turnId);

    restoreViaEdit(currentTurn, md);
    setTimeout(() => { isRestoring = false; }, 5000);
  }
});

const startObserver = () => {
  domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
};

if (document.body) {
  startObserver();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    startObserver();
  });
}

/**
 * Smooth JS Animation for the Donation Banner
 */
function initDonationAnimation(card) {
  let angle = 0;
  let expand = 30;
  let isHovered = false;
  let rafId = null;

  card.addEventListener('mouseenter', () => isHovered = true);
  card.addEventListener('mouseleave', () => isHovered = false);

  function update() {
    if (!document.body.contains(card)) {
      cancelAnimationFrame(rafId);
      return;
    }

    const speed = isHovered ? 1.8 : 0.6;
    angle = (angle + speed) % 360;

    const targetExpand = isHovered ? 100 : 30;
    const lerpFactor = 0.08;
    expand += (targetExpand - expand) * lerpFactor;

    card.style.setProperty('--bts-angle', `${angle}deg`);
    card.style.setProperty('--bts-expand', `${expand}%`);

    rafId = requestAnimationFrame(update);
  }

  update();
}

// ═══════════════════════════════════════════════════════════════════
//  Scroll to Bottom Module
// ═══════════════════════════════════════════════════════════════════
function initScrollBottomModule() {
  let scrollBtn = document.querySelector('.bts-scroll-bottom-btn');
  let activeScroller = null;

  function createBtn() {
    const anchor = document.querySelector('ms-prompt-box');
    if (!anchor || document.querySelector('.bts-scroll-bottom-btn')) return;

    scrollBtn = document.createElement('div');
    scrollBtn.className = 'bts-scroll-bottom-btn';
    scrollBtn.innerHTML = '<span class="material-symbols-outlined">expand_more</span>';
    anchor.appendChild(scrollBtn);

    scrollBtn.onclick = (e) => {
      e.stopPropagation();
      if (activeScroller) {
        activeScroller.scrollTo({
          top: activeScroller.scrollHeight,
          behavior: 'smooth'
        });
      }
    };
  }

  function handleScroll() {
    if (!activeScroller || !scrollBtn || !state.scrollBottomEnabled) {
      if (scrollBtn) scrollBtn.classList.remove('visible');
      return;
    }
    const currentPosFromBottom = activeScroller.scrollHeight - activeScroller.scrollTop - activeScroller.clientHeight;
    if (currentPosFromBottom > 40) {
      scrollBtn.classList.add('visible');
    } else {
      scrollBtn.classList.remove('visible');
    }
  }

  setInterval(() => {
    if (!state.scrollBottomEnabled) {
      if (scrollBtn) scrollBtn.classList.remove('visible');
      return;
    }

    if (!document.querySelector('.bts-scroll-bottom-btn')) {
        createBtn();
    }

    const turns = document.querySelectorAll('ms-chat-turn');
    let scroller = null;
    if (turns.length > 0) {
        let p = turns[turns.length - 1].parentElement;
        while (p && p !== document.body) {
            if (p.scrollHeight > p.clientHeight + 20) { scroller = p; break; }
            p = p.parentElement;
        }
    }

    if (!scroller) {
        const auto = document.querySelector('ms-autoscroll-container');
        if (auto) {
            scroller = Array.from(auto.querySelectorAll('div')).find(d => d.scrollHeight > d.clientHeight + 20) || auto;
        }
    }

    if (scroller && scroller !== activeScroller) {
      if (activeScroller) activeScroller.removeEventListener('scroll', handleScroll);
      activeScroller = scroller;
      activeScroller.addEventListener('scroll', handleScroll);
    }
    
    handleScroll();
  }, 1000);
}

initScrollBottomModule();

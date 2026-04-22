/**
 * <deck-stage> — reusable web component for HTML decks.
 * Note: innerHTML usage below is for static trusted overlay UI only (no user input).
 */

(() => {
  const DESIGN_W_DEFAULT = 1920;
  const DESIGN_H_DEFAULT = 1080;
  const STORAGE_PREFIX = 'deck-stage:slide:';
  const OVERLAY_HIDE_MS = 1800;
  const VALIDATE_ATTR = 'no_overflowing_text,no_overlapping_text,slide_sized_text';

  const pad2 = (n) => String(n).padStart(2, '0');

  const stylesheet = `
    :host { position: fixed; inset: 0; display: block; background: #000; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif; overflow: hidden; }
    .stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .canvas { position: relative; transform-origin: center center; flex-shrink: 0; background: #fff; will-change: transform; }
    ::slotted(*) { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; box-sizing: border-box !important; overflow: hidden; opacity: 0; pointer-events: none; visibility: hidden; }
    ::slotted([data-deck-active]) { opacity: 1; pointer-events: auto; visibility: visible; }
    .tapzones { position: fixed; inset: 0; display: flex; z-index: 2147482000; pointer-events: none; }
    .tapzone { flex: 1; pointer-events: auto; -webkit-tap-highlight-color: transparent; }
    @media (hover: hover) and (pointer: fine) { .tapzones { display: none; } }
    .overlay { position: fixed; left: 50%; bottom: 22px; transform: translate(-50%, 6px) scale(0.92); filter: blur(6px); display: flex; align-items: center; gap: 4px; padding: 4px; background: #000; color: #fff; border-radius: 999px; font-size: 12px; font-feature-settings: "tnum" 1; letter-spacing: 0.01em; opacity: 0; pointer-events: none; transition: opacity 260ms ease, transform 260ms cubic-bezier(.2,.8,.2,1), filter 260ms ease; transform-origin: center bottom; z-index: 2147483000; user-select: none; }
    .overlay[data-visible] { opacity: 1; pointer-events: auto; transform: translate(-50%, 0) scale(1); filter: blur(0); }
    .btn { appearance: none; -webkit-appearance: none; background: transparent; border: 0; margin: 0; padding: 0; color: inherit; font: inherit; cursor: default; display: inline-flex; align-items: center; justify-content: center; height: 28px; min-width: 28px; border-radius: 999px; color: rgba(255,255,255,0.72); transition: background 140ms ease, color 140ms ease; }
    .btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .btn:active { background: rgba(255,255,255,0.18); }
    .btn:focus { outline: none; }
    .btn svg { width: 14px; height: 14px; display: block; }
    .btn.reset { font-size: 11px; font-weight: 500; letter-spacing: 0.02em; padding: 0 10px 0 12px; gap: 6px; }
    .btn.reset .kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; font-family: ui-monospace, monospace; font-size: 10px; color: rgba(255,255,255,0.88); background: rgba(255,255,255,0.12); border-radius: 4px; }
    .count { font-variant-numeric: tabular-nums; color: #fff; font-weight: 500; padding: 0 8px; min-width: 42px; text-align: center; font-size: 12px; }
    .count .sep { color: rgba(255,255,255,0.45); margin: 0 3px; }
    .divider { width: 1px; height: 14px; background: rgba(255,255,255,0.18); margin: 0 2px; }
    @media print { :host { position: static; background: none; overflow: visible; } .stage { position: static; display: block; } .canvas { transform: none !important; width: auto !important; height: auto !important; } ::slotted(*) { position: relative !important; inset: auto !important; width: var(--deck-design-w) !important; height: var(--deck-design-h) !important; opacity: 1 !important; visibility: visible !important; break-after: page; } .overlay, .tapzones { display: none !important; } }
  `;

  function createButton(label, svgPath) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', svgPath);
    svg.appendChild(path);
    btn.appendChild(svg);
    return btn;
  }

  class DeckStage extends HTMLElement {
    static get observedAttributes() { return ['width', 'height', 'noscale']; }
    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._index = 0; this._slides = []; this._notes = []; this._hideTimer = null;
      this._storageKey = STORAGE_PREFIX + (location.pathname || '/');
      this._onKey = this._onKey.bind(this); this._onResize = this._onResize.bind(this);
      this._onSlotChange = this._onSlotChange.bind(this); this._onMouseMove = this._onMouseMove.bind(this);
    }
    get designWidth() { return parseInt(this.getAttribute('width'), 10) || DESIGN_W_DEFAULT; }
    get designHeight() { return parseInt(this.getAttribute('height'), 10) || DESIGN_H_DEFAULT; }
    connectedCallback() {
      this._render(); this._syncPrintPageRule();
      window.addEventListener('keydown', this._onKey); window.addEventListener('resize', this._onResize);
      window.addEventListener('mousemove', this._onMouseMove, { passive: true });
    }
    disconnectedCallback() {
      window.removeEventListener('keydown', this._onKey); window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMouseMove);
      if (this._hideTimer) clearTimeout(this._hideTimer);
    }
    attributeChangedCallback() {
      if (this._canvas) {
        this._canvas.style.width = this.designWidth + 'px'; this._canvas.style.height = this.designHeight + 'px';
        this._fit(); this._syncPrintPageRule();
      }
    }
    _render() {
      const style = document.createElement('style'); style.textContent = stylesheet;
      const stage = document.createElement('div'); stage.className = 'stage';
      const canvas = document.createElement('div'); canvas.className = 'canvas';
      canvas.style.width = this.designWidth + 'px'; canvas.style.height = this.designHeight + 'px';
      canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
      canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
      const slot = document.createElement('slot'); slot.addEventListener('slotchange', this._onSlotChange);
      canvas.appendChild(slot); stage.appendChild(canvas);

      // Tap zones
      const tapzones = document.createElement('div'); tapzones.className = 'tapzones export-hidden';
      const tzBack = document.createElement('div'); tzBack.className = 'tapzone';
      const tzMid = document.createElement('div'); tzMid.className = 'tapzone'; tzMid.style.pointerEvents = 'none';
      const tzFwd = document.createElement('div'); tzFwd.className = 'tapzone';
      tzBack.addEventListener('click', (e) => { e.preventDefault(); this._go(this._index - 1, 'tap'); });
      tzFwd.addEventListener('click', (e) => { e.preventDefault(); this._go(this._index + 1, 'tap'); });
      tapzones.append(tzBack, tzMid, tzFwd);

      // Overlay (built with DOM API, no innerHTML)
      const overlay = document.createElement('div'); overlay.className = 'overlay export-hidden';
      overlay.setAttribute('role', 'toolbar');
      const prevBtn = createButton('Previous', 'M10 3L5 8l5 5');
      prevBtn.classList.add('prev');
      prevBtn.addEventListener('click', () => this._go(this._index - 1, 'click'));

      const countSpan = document.createElement('span'); countSpan.className = 'count';
      const currentSpan = document.createElement('span'); currentSpan.className = 'current'; currentSpan.textContent = '1';
      const sepSpan = document.createElement('span'); sepSpan.className = 'sep'; sepSpan.textContent = '/';
      const totalSpan = document.createElement('span'); totalSpan.className = 'total'; totalSpan.textContent = '1';
      countSpan.append(currentSpan, sepSpan, totalSpan);

      const nextBtn = createButton('Next', 'M6 3l5 5-5 5');
      nextBtn.classList.add('next');
      nextBtn.addEventListener('click', () => this._go(this._index + 1, 'click'));

      const divEl = document.createElement('span'); divEl.className = 'divider';

      const resetBtn = document.createElement('button'); resetBtn.className = 'btn reset'; resetBtn.type = 'button';
      resetBtn.setAttribute('aria-label', 'Reset'); resetBtn.title = 'Reset (R)';
      resetBtn.textContent = 'Reset';
      const kbd = document.createElement('span'); kbd.className = 'kbd'; kbd.textContent = 'R';
      resetBtn.appendChild(kbd);
      resetBtn.addEventListener('click', () => this._go(0, 'click'));

      overlay.append(prevBtn, countSpan, nextBtn, divEl, resetBtn);

      this._root.append(style, stage, tapzones, overlay);
      this._canvas = canvas; this._slot = slot; this._overlay = overlay;
      this._countEl = currentSpan; this._totalEl = totalSpan;
    }
    _syncPrintPageRule() {
      const id = 'deck-stage-print-page'; let tag = document.getElementById(id);
      if (!tag) { tag = document.createElement('style'); tag.id = id; document.head.appendChild(tag); }
      tag.textContent = '@page { size: ' + this.designWidth + 'px ' + this.designHeight + 'px; margin: 0; }';
    }
    _onSlotChange() { this._collectSlides(); this._restoreIndex(); this._applyIndex({ showOverlay: false, broadcast: true, reason: 'init' }); this._fit(); }
    _collectSlides() {
      this._slides = this._slot.assignedElements({ flatten: true }).filter(el => !['TEMPLATE','SCRIPT','STYLE'].includes(el.tagName));
      this._slides.forEach((slide, i) => {
        let label = slide.getAttribute('data-label') || slide.getAttribute('data-screen-label')?.replace(/^\s*\d+\s*/, '').trim() || '';
        if (!label) { const h = slide.querySelector('h1, h2, h3'); if (h) label = h.textContent.trim().slice(0, 40); }
        if (!label) label = 'Slide';
        slide.setAttribute('data-screen-label', `${pad2(i+1)} ${label}`);
        slide.setAttribute('data-deck-slide', String(i));
      });
      if (this._totalEl) this._totalEl.textContent = String(this._slides.length || 1);
      if (this._index >= this._slides.length) this._index = Math.max(0, this._slides.length - 1);
    }
    _restoreIndex() { try { const n = parseInt(localStorage.getItem(this._storageKey), 10); if (Number.isFinite(n) && n >= 0 && n < this._slides.length) this._index = n; } catch {} }
    _persistIndex() { try { localStorage.setItem(this._storageKey, String(this._index)); } catch {} }
    _applyIndex({ showOverlay = true, broadcast = true, reason = 'init' } = {}) {
      if (!this._slides.length) return;
      const prev = this._prevIndex ?? -1;
      this._slides.forEach((s, i) => { if (i === this._index) s.setAttribute('data-deck-active', ''); else s.removeAttribute('data-deck-active'); });
      if (this._countEl) this._countEl.textContent = String(this._index + 1); this._persistIndex();
      if (broadcast) {
        this.dispatchEvent(new CustomEvent('slidechange', { detail: { index: this._index, previousIndex: prev, total: this._slides.length, slide: this._slides[this._index], reason }, bubbles: true, composed: true }));
      }
      this._prevIndex = this._index; if (showOverlay) this._flashOverlay();
    }
    _flashOverlay() { if (!this._overlay) return; this._overlay.setAttribute('data-visible', ''); if (this._hideTimer) clearTimeout(this._hideTimer); this._hideTimer = setTimeout(() => this._overlay.removeAttribute('data-visible'), OVERLAY_HIDE_MS); }
    _fit() {
      if (!this._canvas) return;
      if (this.hasAttribute('noscale')) { this._canvas.style.transform = 'none'; return; }
      const s = Math.min(window.innerWidth / this.designWidth, window.innerHeight / this.designHeight);
      this._canvas.style.transform = `scale(${s})`;
    }
    _onResize() { this._fit(); }
    _onMouseMove() { this._flashOverlay(); }
    _onKey(e) {
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let handled = true;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') this._go(this._index + 1, 'keyboard');
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') this._go(this._index - 1, 'keyboard');
      else if (e.key === 'Home') this._go(0, 'keyboard');
      else if (e.key === 'End') this._go(this._slides.length - 1, 'keyboard');
      else if (e.key === 'r' || e.key === 'R') this._go(0, 'keyboard');
      else if (/^[0-9]$/.test(e.key)) { const n = e.key === '0' ? 9 : parseInt(e.key, 10) - 1; if (n < this._slides.length) this._go(n, 'keyboard'); }
      else handled = false;
      if (handled) e.preventDefault();
    }
    _go(i, reason = 'api') {
      if (!this._slides.length) return;
      const clamped = Math.max(0, Math.min(this._slides.length - 1, i));
      if (clamped === this._index) { this._flashOverlay(); return; }
      this._index = clamped; this._applyIndex({ showOverlay: true, broadcast: true, reason });
    }
    get index() { return this._index; }
    get length() { return this._slides.length; }
    goTo(i) { this._go(i, 'api'); }
    next() { this._go(this._index + 1, 'api'); }
    prev() { this._go(this._index - 1, 'api'); }
    reset() { this._go(0, 'api'); }
  }
  if (!customElements.get('deck-stage')) customElements.define('deck-stage', DeckStage);
})();

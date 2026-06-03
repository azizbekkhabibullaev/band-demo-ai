/**
 * Presentation Navigation Engine
 * Keyboard: ← → Space/Enter = prev/next, O = overview, Esc = close overview, F = fullscreen
 */

const SLIDES = [
  { file: 'slides/slide01.html', title: 'Обложка', section: 'Intro' },
  { file: 'slides/slide02.html', title: 'Проблема', section: 'Контекст' },
  { file: 'slides/slide03.html', title: 'Решение', section: 'Контекст' },
  { file: 'slides/slide04.html', title: 'Архитектура', section: 'Продукт' },
  { file: 'slides/slide05.html', title: 'Клиентский виджет', section: 'Продукт' },
  { file: 'slides/slide06.html', title: 'Лидогенерация', section: 'Продукт' },
  { file: 'slides/slide07.html', title: 'Панель управления', section: 'Аналитика' },
  { file: 'slides/slide08.html', title: 'Диалоги', section: 'Аналитика' },
  { file: 'slides/slide09.html', title: 'Жалобы', section: 'Аналитика' },
  { file: 'slides/slide10.html', title: 'Инсайты', section: 'Аналитика' },
  { file: 'slides/slide11.html', title: 'Бизнес-ценность', section: 'ROI' },
  { file: 'slides/slide12.html', title: 'Финансовый эффект', section: 'ROI' },
  { file: 'slides/slide13.html', title: 'Что уже работает', section: 'Статус' },
  { file: 'slides/slide14.html', title: 'Следующие шаги', section: 'Статус' },
  { file: 'slides/slide15.html', title: 'Вопросы', section: 'Outro' },
];

let currentSlide = 0;
let overviewOpen = false;

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  // Read current slide from hash
  const hash = window.location.hash.replace('#', '');
  if (hash && /^\d+$/.test(hash)) {
    currentSlide = Math.min(parseInt(hash) - 1, SLIDES.length - 1);
    currentSlide = Math.max(0, currentSlide);
  }
  renderNavBar();
  updateHash();
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(index) {
  if (index < 0 || index >= SLIDES.length) return;
  currentSlide = index;
  updateHash();
  updateNavBar();
  // If in iframe context, navigate the parent frame
  if (window.parent && window.parent !== window) {
    window.parent.navigateToSlide(index);
  }
}

function next() { if (currentSlide < SLIDES.length - 1) goTo(currentSlide + 1); }
function prev() { if (currentSlide > 0) goTo(currentSlide - 1); }

function updateHash() {
  if (window.location.hash !== '#' + (currentSlide + 1)) {
    history.replaceState(null, '', '#' + (currentSlide + 1));
  }
}

// ── Nav bar ───────────────────────────────────────────────────────────────────
function renderNavBar() {
  const nav = document.getElementById('slide-nav');
  if (!nav) return;
  nav.innerHTML = `
    <span class="nav-brand">IPOTEKA BANK · AI PLATFORM</span>
    <div class="nav-center">
      <a class="nav-btn" id="nav-prev" title="Назад (←)">&#8592;</a>
      <span class="slide-counter" id="nav-counter">${currentSlide + 1} / ${SLIDES.length}</span>
      <a class="nav-btn" id="nav-next" title="Вперёд (→)">&#8594;</a>
    </div>
    <div style="display:flex;align-items:center;gap:16px;">
      <button class="nav-overview-btn" id="nav-overview" title="Обзор (O)">&#9635; Обзор</button>
      <span class="nav-key-hint"><kbd>←</kbd><kbd>→</kbd> навигация &nbsp; <kbd>F</kbd> полный экран</span>
    </div>
  `;
  document.getElementById('nav-prev')?.addEventListener('click', prev);
  document.getElementById('nav-next')?.addEventListener('click', next);
  document.getElementById('nav-overview')?.addEventListener('click', toggleOverview);
}

function updateNavBar() {
  const counter = document.getElementById('nav-counter');
  if (counter) counter.textContent = `${currentSlide + 1} / ${SLIDES.length}`;
}

// ── Overview modal ────────────────────────────────────────────────────────────
function toggleOverview() {
  overviewOpen = !overviewOpen;
  const existing = document.getElementById('overview-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'overview-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(6, 11, 24, 0.97);
    backdrop-filter: blur(20px);
    display: flex; flex-direction: column;
    padding: 48px;
    overflow-y: auto;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;';
  header.innerHTML = `
    <div>
      <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#60a5fa;margin-bottom:6px;">ОБЗОР ПРЕЗЕНТАЦИИ</div>
      <div style="font-size:28px;font-weight:800;color:#f0f4ff;">Ipoteka Bank — AI Platform</div>
    </div>
    <button id="close-overview" style="width:40px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3c0;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
  `;
  modal.appendChild(header);

  // Group slides by section
  const sections = {};
  SLIDES.forEach((s, i) => {
    if (!sections[s.section]) sections[s.section] = [];
    sections[s.section].push({ ...s, index: i });
  });

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid; grid-template-columns: repeat(5,1fr); gap:16px;';

  SLIDES.forEach((slide, i) => {
    const card = document.createElement('div');
    const isActive = i === currentSlide;
    card.style.cssText = `
      background: ${isActive ? 'rgba(37,99,235,0.15)' : 'rgba(17,28,51,0.8)'};
      border: 1px solid ${isActive ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.06)'};
      border-radius: 12px; padding: 16px; cursor: pointer;
      transition: all 0.15s;
    `;
    card.innerHTML = `
      <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${isActive ? '#60a5fa' : '#5a6b8a'};margin-bottom:6px;">${String(i+1).padStart(2,'0')} · ${slide.section}</div>
      <div style="font-size:13px;font-weight:600;color:${isActive ? '#f0f4ff' : '#94a3c0'};">${slide.title}</div>
    `;
    card.addEventListener('mouseenter', () => { if (!isActive) card.style.borderColor = 'rgba(255,255,255,0.15)'; });
    card.addEventListener('mouseleave', () => { if (!isActive) card.style.borderColor = 'rgba(255,255,255,0.06)'; });
    card.addEventListener('click', () => {
      modal.remove();
      overviewOpen = false;
      navigateToSlide(i);
    });
    grid.appendChild(card);
  });
  modal.appendChild(grid);
  document.body.appendChild(modal);
  document.getElementById('close-overview')?.addEventListener('click', () => { modal.remove(); overviewOpen = false; });
}

// ── Public navigation (called from index.html iframe controller) ──────────────
window.navigateFromSlide = function(index) {
  currentSlide = index;
  updateNavBar();
  updateHash();
};

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (overviewOpen) {
    if (e.key === 'Escape') toggleOverview();
    return;
  }
  switch(e.key) {
    case 'ArrowRight': case ' ': case 'Enter': e.preventDefault(); next(); break;
    case 'ArrowLeft':                          e.preventDefault(); prev(); break;
    case 'o': case 'O':                        toggleOverview(); break;
    case 'f': case 'F':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
      break;
    case 'Escape':
      if (document.fullscreenElement) document.exitFullscreen();
      break;
  }
});

// ── Touch / swipe ─────────────────────────────────────────────────────────────
let touchStartX = 0;
document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].screenX - touchStartX;
  if (Math.abs(dx) > 50) {
    if (dx < 0) next();
    else prev();
  }
}, { passive: true });

// ── Init on load ──────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

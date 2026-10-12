/* Главная: видео-hero, направления, карусель новинок, товары в наличии по направлениям, бренды, видеоблок. */
(function () {
  const { sections, categories, products, novelties } = window.APEX_DATA;
  const { esc, plural, productCard, videoBlock, reduceMotion, icon } = window.ApexUI;
  const el = id => document.getElementById(id);
  const countIn = s => products.filter(p => s.categories.includes(p.category)).length;

  /* ---------- hero ---------- */
  const video = el('hero-video');
  const toggle = el('hero-toggle');
  // Кнопка отражает фактическое состояние ролика: браузер может сам остановить автозапуск.
  const syncToggle = () => {
    const playing = !video.paused;
    toggle.setAttribute('aria-label', playing ? 'Пауза видео' : 'Воспроизвести видео');
    toggle.innerHTML = playing ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>' : icon.play;
  };
  video.addEventListener('play', syncToggle);
  video.addEventListener('pause', syncToggle);
  const setPlaying = play => {
    (play ? video.play() : Promise.resolve(video.pause())).catch(syncToggle);
    syncToggle();
  };
  if (!reduceMotion()) {
    video.preload = 'auto';
    video.autoplay = true;
    setPlaying(true);
    // Первый play() может прийтись на момент до загрузки — повторяем, пока пользователь сам не поставил паузу.
    let userPaused = false;
    toggle.addEventListener('click', () => { userPaused = true; }, { once: true });
    video.addEventListener('canplay', () => { if (!userPaused && video.paused) setPlaying(true); }, { once: true });
  } else setPlaying(false);
  toggle.hidden = false;
  toggle.addEventListener('click', () => setPlaying(video.paused));

  const brandCount = new Set(products.map(p => p.brand).filter(Boolean)).size;
  el('hero-stats').innerHTML = [
    [products.length, plural(products.length, 'позиция', 'позиции', 'позиций')],
    [sections.length, 'направлений'],
    [brandCount, 'брендов'],
    [products.filter(p => p.stock).length, 'в наличии']
  ].map(([n, t]) => `<div><dt>${t}</dt><dd>${n}</dd></div>`).join('');

  /* ---------- направления ---------- */
  el('dir-grid').innerHTML = sections.map(s => {
    const n = countIn(s);
    return `<a class="dir" href="category.html?section=${s.key}">
      <img src="assets/img/icons/${s.key}.svg" alt="" width="28" height="28">
      <b>${esc(s.title)}</b>
      <span>${n} ${plural(n, 'товар', 'товара', 'товаров')} · ${s.categories.length} ${plural(s.categories.length, 'категория', 'категории', 'категорий')}</span>
    </a>`;
  }).join('');

  /* ---------- новинки ---------- */
  const track = el('new-track');
  const newItems = novelties.map(id => products.find(p => p.id === id)).filter(Boolean);
  track.innerHTML = newItems.map(p => productCard(p, { compact: true })).join('');
  document.querySelectorAll('[data-scroll]').forEach(b => b.addEventListener('click', () => {
    const card = track.querySelector('.card');
    const step = card ? (card.offsetWidth + 14) * Math.max(1, Math.floor(track.clientWidth / (card.offsetWidth + 14))) : track.clientWidth;
    track.scrollBy({ left: step * Number(b.dataset.scroll), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }));
  const syncNav = () => {
    const [prev, next] = document.querySelectorAll('[data-scroll]');
    prev.disabled = track.scrollLeft < 8;
    next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
  };
  track.addEventListener('scroll', syncNav, { passive: true });
  window.addEventListener('resize', syncNav);
  syncNav();

  /* ---------- в наличии ---------- */
  // Показываем направления, где есть товары в наличии с фото — так блок выглядит живым, а не заглушками.
  const stockSections = sections.filter(s => products.some(p => p.stock && p.image && s.categories.includes(p.category)));
  let activeTab = stockSections[0] && stockSections[0].key;
  const renderStock = () => {
    const s = sections.find(x => x.key === activeTab);
    const items = products.filter(p => p.stock && s.categories.includes(p.category))
      .sort((a, b) => (!!b.image - !!a.image) || (novelties.includes(b.id) - novelties.includes(a.id)))
      .slice(0, 8);
    el('stock-tabs').innerHTML = stockSections.map(x => `<button type="button" role="tab" class="chip${x.key === activeTab ? ' is-on' : ''}" aria-selected="${x.key === activeTab}" data-tab="${x.key}">${esc(x.title)}</button>`).join('');
    el('stock-grid').innerHTML = items.map(p => productCard(p)).join('')
      + `<a class="more-tile" href="category.html?section=${s.key}&stock=1"><b>Все товары направления</b><span>${esc(s.title)}</span>${icon.arrow}</a>`;
  };
  el('stock-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    activeTab = b.dataset.tab;
    renderStock();
    el('stock-tabs').querySelector(`[data-tab="${activeTab}"]`).focus();
  });
  el('stock-tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = [...el('stock-tabs').querySelectorAll('[data-tab]')];
    const i = tabs.indexOf(document.activeElement);
    tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].click();
  });
  if (activeTab) renderStock();

  /* ---------- бренды ---------- */
  const brandInfo = {
    APEXWOLT: 'Профессиональный электроинструмент',
    VOLTEXA: 'Климатическая техника и инструмент',
    SUMO: 'Аккумуляторные решения и техника',
    PROPEL: 'Оснастка и расходные материалы',
    'APEX-KREP': 'Крепёж для строительных задач'
  };
  el('brand-grid').innerHTML = Object.entries(brandInfo).map(([b, text]) => {
    const n = products.filter(p => p.brand === b).length;
    return `<a class="brand-card" href="category.html?brand=${encodeURIComponent(b)}">
      <span class="brand-logo"><img src="assets/img/brands/${b.toLowerCase()}.svg" alt="${b === 'APEX-KREP' ? 'APEX–КРЕП' : b}"${b === 'APEXWOLT' ? ' class="is-light"' : ''}></span><span>${text}</span>
      <small>${n} ${plural(n, 'позиция', 'позиции', 'позиций')} ${icon.arrow}</small>
    </a>`;
  }).join('');

  /* ---------- видео ---------- */
  document.querySelector('[data-video-block]').outerHTML = videoBlock();
})();

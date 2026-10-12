/* Общие части всех страниц: шапка с меню каталога и поиском, нижняя навигация на mobile,
   панели избранного/сравнения/заявки, видеоплеер, подписка, подвал, общий рендер карточки товара. */
(function () {
  const MAIN_SITE = 'https://apexwolt-b2b-preview.netlify.app';
  const PLACEHOLDER = 'assets/img/category-placeholder.svg';
  const { sections, categories, products } = window.APEX_DATA;
  const store = window.ApexStore;
  const page = document.body.dataset.page;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => `${Math.round(Number(n)).toLocaleString('ru-RU')} ₽`;
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sectionOf = p => sections.find(s => s.key === categories[p.category].section);
  const productUrl = p => `product.html?id=${encodeURIComponent(p.id)}`;
  const imageOf = p => p.image || PLACEHOLDER;
  const novelties = new Set(window.APEX_DATA.novelties);

  const icon = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    compare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V10M12 20V4M18 20v-7"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5"/></svg>',
    request: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2.5"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/></svg>'
  };

  // Короткая строка характеристик для карточки: первые значения из спецификации.
  const specPair = s => { const i = s.indexOf(':'); return i > 0 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : ['', s.trim()]; };
  // Ключевые характеристики для карточки: до 6 коротких значений в одну строку через точку с разделителем.
  const summary = (p, n = 6) => p.specs.map(s => specPair(s)).filter(([k, v]) => v && v.length <= 40 && !/^(Гарантия|Комплектация|Страна)/i.test(k)).slice(0, n).map(([, v]) => v).join(' · ');

  const stockLabel = p => {
    if (p.stock) return '<span class="stock is-in"><i></i>В наличии</span>';
    const when = p.eta ? ` · ${esc(p.eta)}` : p.lead ? ` · ${p.lead} ${plural(p.lead, 'день', 'дня', 'дней')}` : '';
    return `<span class="stock"><i></i>Под заказ${when}</span>`;
  };
  const priceBlock = p => p.price
    ? `<strong>${money(p.price)}</strong><small>${icon.lock}Цена партнёра — после входа</small>`
    : `<strong class="price-ask">Цена по запросу</strong><small>${icon.lock}Условия — после входа</small>`;

  const productCard = (p, opts = {}) => {
    const fav = store.isFavorite(p.id), cmp = store.inCompare(p.id), qty = store.qty(p.id);
    return `
    <article class="card${opts.compact ? ' is-compact' : ''}" data-id="${esc(p.id)}">
      <a class="card-media${p.image ? '' : ' is-placeholder'}" href="${productUrl(p)}" tabindex="-1" aria-hidden="true">
        <img src="${esc(imageOf(p))}" alt="" loading="lazy" decoding="async" width="600" height="600">
      </a>
      <div class="card-flags">${novelties.has(p.id) ? '<span class="flag flag-new">Новинка</span>' : ''}${p.price ? '<span class="flag">МРЦ</span>' : ''}</div>
      <div class="card-actions">
        <button type="button" class="icon-btn${fav ? ' is-on' : ''}" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Убрать из избранного' : 'В избранное'}">${icon.heart}</button>
        <button type="button" class="icon-btn${cmp ? ' is-on' : ''}" data-act="cmp" aria-pressed="${cmp}" aria-label="${cmp ? 'Убрать из сравнения' : 'Добавить к сравнению'}">${icon.compare}</button>
      </div>
      <div class="card-body">
        ${p.brand ? `<p class="card-brand">${esc(p.brand)}</p>` : ''}
        <h3 class="card-title"><a href="${productUrl(p)}" title="${esc(p.name)}">${esc(p.title)}</a></h3>
        <p class="card-kit"${p.kit ? '' : ' aria-hidden="true"'}>${p.kit ? esc(p.kit) : '&nbsp;'}</p>
        <p class="card-specs">${esc(summary(p))}</p>
        <p class="card-sku">Артикул: ${esc(p.sku)}</p>
        ${stockLabel(p)}
      </div>
      <div class="card-foot">
        <div class="price">${priceBlock(p)}</div>
        <div class="card-buttons">
          ${opts.compact ? '' : `<a class="button button-ghost" href="${productUrl(p)}">Подробнее</a>`}
          <button type="button" class="button button-dark" data-act="req">${qty ? `В заявке · ${qty}` : 'В заявку'}</button>
        </div>
      </div>
    </article>`;
  };

  /* ---------- видеоблок (главная и «О компании») ---------- */
  const videos = [
    { kind: 'Видеообзор', title: 'Компактный шуруповёрт APEXWOLT ДА-16,8-45', image: 'assets/img/video/review-obzor.jpg', youtube: 'BhFD1vRnnCM' },
    { kind: 'Промо', title: 'Инструменты из Сибири', text: 'Короткий ролик о бренде APEXWOLT', image: 'assets/img/video/review-promo.jpg', youtube: '1ntNRg_MeZg' },
    { kind: 'Shorts', title: 'Короткие ролики', text: 'Быстрые моменты из работы инструмента', image: 'assets/img/video/review-shorts.jpg', href: 'https://www.youtube.com/@apexwolt/shorts' }
  ];
  // Ролики APEXWOLT с Яндекс Диска («Видео для сайта»), хранятся на сайте.
  const clips = [
    { src: 'assets/video/apexwolt-1.mp4', title: 'APEXWOLT · ролик 1', duration: '0:23' },
    { src: 'assets/video/apexwolt-2.mp4', title: 'APEXWOLT · ролик 2', duration: '0:22' },
    { src: 'assets/video/apexwolt-3.mp4', title: 'APEXWOLT · ролик 3', duration: '0:25' }
  ];
  const channels = [
    ['YouTube', 'https://youtube.com/@apexwolt'],
    ['VK Видео', 'https://vk.ru/club235673348'],
    ['Rutube', 'https://rutube.ru/channel/75298551/videos/']
  ];
  /* ---------- документы: декларации и сертификаты соответствия ---------- */
  // Файлы — из папки SUMO\Сертфикация\Сертификаты; номера сверены по сканам.
  const documents = [
    { group: 'Декларации о соответствии', items: [
      { title: 'Аккумуляторный ручной инструмент с зарядными устройствами', number: 'ЕАЭС N RU Д-CN.РА04.В.80058/26', note: 'ТР ЕАЭС 037/2016 · действует до 03.06.2031', file: 'declaration-eaes-akb-instrument.pdf', size: '91 КБ' },
      { title: 'Аккумуляторы и аккумуляторные батареи литиевой системы', number: 'РОСС RU Д-CN.РА01.В.17955/26', note: 'Единый перечень продукции РФ · действует до 01.06.2031', file: 'declaration-akkumulyatory.pdf', size: '93 КБ' }
    ] },
    { group: 'Сертификаты соответствия ЕАЭС', items: [
      { title: 'Зарядные устройства', number: 'ЕАЭС KG 417/041.CN.02.01439', file: 'cert-01-zaryadnye-ustroystva.pdf', size: '1,4 МБ' },
      { title: 'Сетевой инструмент: перфораторы, лобзики, УШМ', number: 'ЕАЭС KG 417/041.CN.02.01441', file: 'cert-02-setevoy-instrument.pdf', size: '10 МБ' },
      { title: 'Технические фены сетевые', number: 'ЕАЭС KG 417/041.CN.02.01443', file: 'cert-03-setevye-feny.pdf', size: '6,7 МБ' },
      { title: 'Аккумуляторный инструмент: перфораторы, реноваторы, УШМ, краскопульты, винтоверты, гайковерты, шуруповерты', number: 'ЕАЭС KG 417/041.CN.02.01406', file: 'cert-04-akkumulyatornyy-instrument.pdf', size: '1,9 МБ' },
      { title: 'Аккумуляторные мойки', number: 'ЕАЭС KG 417/041.CN.02.01589', file: 'cert-05-moyki-akb.pdf', size: '530 КБ' },
      { title: 'Пилы сетевые', number: 'ЕАЭС KG 417/041.CN.02.01618', file: 'cert-06-pily-setevye.pdf', size: '6,6 МБ' },
      { title: 'Пилы и мини-пилы аккумуляторные', number: 'ЕАЭС KG 417/041.CN.02.01609', file: 'cert-07-pily-akb.pdf', size: '9,3 МБ' },
      { title: 'Аккумуляторные триммеры, секаторы, воздуходувки', number: 'ЕАЭС KG 417/041.CN.02.01616', file: 'cert-08-sadovaya-tehnika-akb.pdf', size: '12 МБ' }
    ] }
  ];
  const docIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>';
  const docsBlock = () => documents.map(g => `
    <div class="docs-group">
      <h3>${g.group} <span>${g.items.length}</span></h3>
      <ul class="docs-list">${g.items.map(d => `
        <li><a class="doc" href="assets/docs/${d.file}" target="_blank" rel="noopener" aria-label="${esc(d.title)}, № ${esc(d.number)}, PDF ${d.size}, откроется в новой вкладке">
          <span class="doc-icon">${docIcon}</span>
          <span class="doc-text"><b>${esc(d.title)}</b><small>№ ${esc(d.number)}${d.note ? ` · ${esc(d.note)}` : ''}</small></span>
          <span class="doc-meta">PDF · ${d.size}${icon.external}</span>
        </a></li>`).join('')}
      </ul>
    </div>`).join('') + '<p class="hint docs-hint">Документы оформлены на импортёра продукции. Оригиналы и другие разрешительные документы предоставит менеджер по запросу.</p>';

  const videoBlock = () => `
    <div class="clip-grid">
      ${clips.map(c => `
        <figure class="clip">
          <video controls playsinline preload="metadata" src="${c.src}#t=0.5" aria-label="${esc(c.title)}"></video>
          <figcaption><b>${esc(c.title)}</b><span>${c.duration}</span></figcaption>
        </figure>`).join('')}
    </div>
    <div class="video-grid">
      ${videos.map((v, i) => {
        const inner = `<span class="video-thumb"><img src="${v.image}" alt="" loading="lazy"><span class="play">${v.youtube ? icon.play : icon.external}</span></span>
          <span class="video-meta"><small>${v.kind}</small><b>${esc(v.title)}</b>${v.text ? `<span>${esc(v.text)}</span>` : ''}</span>`;
        return v.youtube
          ? `<button type="button" class="video-card${i === 0 ? ' is-lead' : ''}" data-video="${v.youtube}" aria-label="Смотреть: ${esc(v.title)}">${inner}</button>`
          : `<a class="video-card" href="${v.href}" target="_blank" rel="noopener">${inner}</a>`;
      }).join('')}
    </div>
    <p class="channels"><span>Все материалы:</span>${channels.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${t}${icon.external}</a>`).join('')}</p>`;

  /* ---------- шапка ---------- */
  const megaMenu = `
    <div class="mega glass" id="mega" hidden>
      <div class="mega-head"><p class="menu-title">Каталог APEXWOLT</p><a class="link" href="catalog.html">Все направления ${icon.arrow}</a></div>
      <div class="mega-grid">
        ${sections.map(s => `
          <details class="mega-col">
            <summary><img src="assets/img/icons/${s.key}.svg" alt="" width="20" height="20"><a href="category.html?section=${s.key}">${esc(s.title)}</a></summary>
            <ul>${s.categories.map(c => `<li><a href="category.html?category=${c}">${esc(categories[c].title)}</a></li>`).join('')}</ul>
          </details>`).join('')}
      </div>
    </div>`;

  const nav = [['index.html#new', 'Новинки'], ['catalog.html', 'Каталог'], ['about.html', 'О компании'], ['about.html#video', 'Видео'], ['about.html#contacts', 'Контакты']];
  const header = `
  <header class="site-header">
    <div class="topbar">
      <nav aria-label="Разделы сайта">${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
      <span class="topbar-phones"><a class="topbar-phone" href="tel:+79330238843">+7 (933) 023-88-43</a><a class="topbar-phone" href="tel:+79086671194">+7 (908) 667-11-94</a></span>
    </div>
    <div class="header-inner">
      <a class="brand" href="index.html" aria-label="APEXWOLT — на главную"><img src="assets/img/apexwolt-logo.svg" alt="APEXWOLT" width="158" height="85"></a>
      <div class="menu-wrap">
        <button type="button" class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="mega">${icon.menu}<span>Каталог</span></button>
        ${megaMenu}
      </div>
      <form class="search" id="search" role="search" autocomplete="off">
        <label class="visually-hidden" for="search-input">Поиск по каталогу</label>
        <input id="search-input" type="search" placeholder="Товар, артикул или бренд" aria-autocomplete="list" aria-controls="search-results">
        <button type="submit" aria-label="Найти">${icon.search}<span>Найти</span></button>
        <div class="search-results glass" id="search-results" role="listbox" hidden></div>
      </form>
      <nav class="header-icons" aria-label="Личное">
        <a class="hicon" href="${MAIN_SITE}/account.html">${icon.user}<span>Профиль</span></a>
        <button type="button" class="hicon" data-open="compare">${icon.compare}<span>Сравнение</span><b data-count="compare" hidden></b></button>
        <button type="button" class="hicon" data-open="favorites">${icon.heart}<span>Избранное</span><b data-count="favorites" hidden></b></button>
        <button type="button" class="hicon" data-open="request">${icon.request}<span>Заявка</span><b data-count="request" hidden></b></button>
      </nav>
    </div>
  </header>`;

  const bottomNav = `
  <nav class="bottom-nav" aria-label="Быстрые действия">
    <button type="button" data-open-menu>${icon.menu}<span>Каталог</span></button>
    <button type="button" data-open="compare">${icon.compare}<span>Сравнение</span><b data-count="compare" hidden></b></button>
    <button type="button" data-focus-search>${icon.search}<span>Поиск</span></button>
    <button type="button" data-open="favorites">${icon.heart}<span>Избранное</span><b data-count="favorites" hidden></b></button>
    <button type="button" data-open="request">${icon.request}<span>Заявка</span><b data-count="request" hidden></b></button>
  </nav>`;

  const footer = `
  <section class="subscribe" aria-labelledby="subscribe-title">
    <div class="subscribe-copy">
      <h2 id="subscribe-title">Новинки и спецусловия</h2>
      <p>Раз в месяц — новые модели, поступления и предложения для партнёров.</p>
    </div>
    <form class="subscribe-form" id="subscribe" novalidate>
      <label class="visually-hidden" for="sub-email">Email</label>
      <input id="sub-email" name="email" type="email" placeholder="email@company.ru" autocomplete="email" required>
      <button class="button button-dark" type="submit">Подписаться</button>
      <label class="check"><input type="checkbox" name="consent" required><span>Согласен получать рекламную рассылку и с <a href="${MAIN_SITE}/marketing-consent.html">условиями согласия</a></span></label>
      <p class="form-msg" role="status"></p>
    </form>
  </section>
  <footer class="site-footer">
    <div class="footer-grid">
      <div>
        <img class="footer-logo" src="assets/img/apexwolt-logo.svg" alt="APEXWOLT" width="158" height="85">
        <p class="muted">B2B-платформа APEXWOLT: подбор инструмента, заявка менеджеру и сопровождение партнёров. Оплата на сайте не производится.</p>
      </div>
      <div>
        <h3>Каталог</h3>
        ${sections.slice(0, 6).map(s => `<a href="category.html?section=${s.key}">${esc(s.title)}</a>`).join('')}
        <a href="catalog.html">Все направления</a>
      </div>
      <div>
        <h3>Компания</h3>
        <a href="about.html">О компании</a>
        <a href="about.html#production">Производство</a>
        <a href="about.html#partners">Партнёрам</a>
        <a href="about.html#video">Видеообзоры</a>
        <a href="${MAIN_SITE}/faq.html">Вопросы и ответы</a>
      </div>
      <div>
        <h3>Документы</h3>
        <a href="documents.html">Сертификаты и декларации</a>
        <a href="${MAIN_SITE}/privacy.html">Политика конфиденциальности</a>
        <a href="${MAIN_SITE}/platform-rules.html">Правила платформы</a>
        <a href="${MAIN_SITE}/request-terms.html">Условия заявки</a>
        <a href="${MAIN_SITE}/consent-personal-data.html">Согласие на обработку данных</a>
        <a href="${MAIN_SITE}/cookie-policy.html">Cookie</a>
      </div>
      <div class="footer-company">
        <h3>Контакты</h3>
        <a href="tel:+79330238843">+7 (933) 023-88-43</a>
        <a href="tel:+79086671194">+7 (908) 667-11-94</a>
        <a href="mailto:idea.apexwolt@mail.ru">idea.apexwolt@mail.ru</a>
        <span>09:00–20:00 ежедневно</span>
        <span class="muted">ООО «Гранит» · ИНН 3817050540 · ОГРН 1203800007850</span>
      </div>
    </div>
    <p class="footer-bottom">APEXWOLT © ${new Date().getFullYear()} · Дизайн и разработка — <a href="https://t.me/aleks1y_m">LMH Studio</a></p>
  </footer>
  ${bottomNav}
  <div class="backdrop" id="backdrop" hidden></div>
  <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
    <button type="button" class="drawer-close icon-btn" data-close aria-label="Закрыть">${icon.close}</button>
    <div id="drawer-body"></div>
  </aside>
  <div class="player" id="player" role="dialog" aria-modal="true" aria-label="Видео APEXWOLT" hidden>
    <div class="player-frame" id="player-frame"></div>
    <button type="button" class="player-close icon-btn" aria-label="Закрыть видео">${icon.close}</button>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  document.querySelector('[data-slot="header"]').outerHTML = header;
  document.querySelector('[data-slot="footer"]').outerHTML = footer;
  document.querySelectorAll('.topbar a').forEach(a => {
    const file = a.getAttribute('href').split('#')[0];
    if (!a.getAttribute('href').includes('#') && location.pathname.endsWith(file)) a.setAttribute('aria-current', 'page');
  });

  /* ---------- toast ---------- */
  let toastTimer;
  const toast = text => {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
  };

  /* ---------- счётчики ---------- */
  const syncCounts = () => {
    const counts = { compare: store.compare().length, favorites: store.favorites().length, request: store.request().reduce((s, r) => s + r.qty, 0) };
    document.querySelectorAll('[data-count]').forEach(b => {
      const n = counts[b.dataset.count];
      b.textContent = n > 99 ? '99+' : n;
      b.hidden = !n;
    });
  };

  /* ---------- меню каталога ---------- */
  const menuBtn = document.getElementById('menu-btn');
  const mega = document.getElementById('mega');
  const wide = matchMedia('(min-width: 861px)');
  const syncDetails = () => mega.querySelectorAll('details').forEach(d => { d.open = wide.matches; });
  syncDetails();
  wide.addEventListener('change', syncDetails);
  const setMenu = open => {
    mega.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open);
    document.body.classList.toggle('menu-open', open && !wide.matches);
  };
  menuBtn.addEventListener('click', () => setMenu(mega.hidden));
  mega.addEventListener('click', e => { if (e.target.closest('summary a')) e.stopPropagation(); });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-menu]')) { window.scrollTo({ top: 0 }); setMenu(mega.hidden); return; }
    if (!mega.hidden && !e.target.closest('.menu-wrap')) setMenu(false);
  });

  /* ---------- поиск с подсказками ---------- */
  const searchForm = document.getElementById('search');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const norm = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9/.,]+/g, ' ').trim();
  const index = new Map(products.map(p => [p.id, norm([p.name, p.sku, p.brand, categories[p.category].title, sectionOf(p).title, p.specs.join(' ')].join(' '))]));
  const findProducts = (q, pool = products) => {
    const words = norm(q).split(' ').filter(Boolean);
    return words.length ? pool.filter(p => words.every(w => index.get(p.id).includes(w))) : pool.slice();
  };
  const findCategories = q => {
    const w = norm(q);
    return w.length < 2 ? [] : Object.entries(categories).filter(([, c]) => norm(c.title).includes(w)).slice(0, 4);
  };
  const renderSuggestions = () => {
    const q = searchInput.value.trim();
    if (!q) { searchResults.hidden = true; return; }
    const found = findProducts(q);
    const cats = findCategories(q);
    searchResults.innerHTML = (cats.length ? `<p class="search-group">Категории</p>${cats.map(([k, c]) => `<a role="option" class="search-cat" href="category.html?category=${k}">${esc(c.title)}<small>${esc(sections.find(s => s.key === c.section).title)}</small></a>`).join('')}` : '')
      + (found.length
        ? `<p class="search-group">Товары · ${found.length}</p>${found.slice(0, 6).map(p => `<a role="option" href="${productUrl(p)}"><img src="${esc(imageOf(p))}" alt=""><span><b>${esc(p.title)}</b><small>Артикул ${esc(p.sku)}${p.price ? ` · ${money(p.price)}` : ''}</small></span></a>`).join('')}
           ${found.length > 6 ? `<a role="option" class="search-all" href="category.html?q=${encodeURIComponent(q)}">Все результаты (${found.length}) ${icon.arrow}</a>` : ''}`
        : `<p class="search-empty">Ничего не нашлось по запросу «${esc(q)}». Попробуйте артикул или название категории.</p>`);
    searchResults.hidden = false;
  };
  searchInput.addEventListener('input', renderSuggestions);
  searchInput.addEventListener('focus', renderSuggestions);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchResults.hidden = true; searchInput.blur(); }
    if (e.key === 'ArrowDown') { const first = searchResults.querySelector('a'); if (first) { e.preventDefault(); first.focus(); } }
  });
  searchResults.addEventListener('keydown', e => {
    const links = [...searchResults.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? links[i - 1] : searchInput).focus(); }
    if (e.key === 'Escape') { searchResults.hidden = true; searchInput.focus(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#search')) searchResults.hidden = true; });
  searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) { searchInput.focus(); return; }
    searchResults.hidden = true;
    if (page === 'category') window.dispatchEvent(new CustomEvent('apex:search', { detail: q }));
    else location.href = `category.html?q=${encodeURIComponent(q)}`;
  });
  document.querySelectorAll('[data-focus-search]').forEach(b => b.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    searchInput.focus();
  }));

  /* ---------- панель (избранное / сравнение / заявка) ---------- */
  const drawer = document.getElementById('drawer');
  const drawerBody = document.getElementById('drawer-body');
  const backdrop = document.getElementById('backdrop');
  let drawerKind = null;
  let lastFocus = null;

  const miniRow = (p, extra = '') => `
    <li class="mini" data-id="${esc(p.id)}">
      <a href="${productUrl(p)}"><img src="${esc(imageOf(p))}" alt=""></a>
      <div class="mini-info">
        <a href="${productUrl(p)}"><b>${esc(p.title)}</b></a>${p.kit ? `<small>${esc(p.kit)}</small>` : ''}
        <small>Артикул ${esc(p.sku)}${p.price ? ` · МРЦ ${money(p.price)}` : ' · цена по запросу'}</small>
        ${extra}
      </div>
    </li>`;
  const empty = (title, text) => `<div class="empty"><p class="empty-title">${title}</p><p>${text}</p><a class="button button-ghost" href="catalog.html">Перейти в каталог</a></div>`;

  // Для сравнения берём характеристики, которые есть хотя бы у двух моделей из списка.
  const compareRows = list => {
    const maps = list.map(p => new Map(p.specs.map(specPair).filter(([k]) => k)));
    const keys = [];
    maps.forEach(m => m.forEach((_, k) => { if (!keys.includes(k)) keys.push(k); }));
    const shared = keys.filter(k => maps.filter(m => m.has(k)).length >= Math.min(2, list.length));
    return [
      ['МРЦ', list.map(p => p.price ? money(p.price) : 'По запросу')],
      ['Наличие', list.map(p => p.stock ? 'В наличии' : 'Под заказ')],
      ['Бренд', list.map(p => p.brand || '—')],
      ['Категория', list.map(p => categories[p.category].title)],
      ...shared.slice(0, 24).map(k => [k, maps.map(m => m.get(k) || '—')])
    ];
  };

  const views = {
    favorites() {
      const list = store.favorites().map(store.byId);
      return `<h2 id="drawer-title">Избранное</h2>
        ${list.length ? `<ul class="mini-list">${list.map(p => miniRow(p, `<div class="mini-actions"><button type="button" class="link" data-act="req">В заявку</button><button type="button" class="link muted" data-act="fav">Убрать</button></div>`)).join('')}</ul>`
          : empty('Пока пусто', 'Отмечайте товары сердцем, чтобы вернуться к ним позже.')}`;
    },
    compare() {
      const list = store.compare().map(store.byId);
      if (!list.length) return `<h2 id="drawer-title">Сравнение</h2>${empty('Нечего сравнивать', `Добавьте до ${store.COMPARE_LIMIT} товаров кнопкой сравнения на карточке.`)}`;
      const rows = compareRows(list);
      return `<h2 id="drawer-title">Сравнение <span class="muted">${list.length} из ${store.COMPARE_LIMIT}</span></h2>
        <div class="compare-scroll"><table class="compare">
          <thead><tr><th scope="col"><span class="visually-hidden">Параметр</span></th>${list.map(p => `<th scope="col" data-id="${esc(p.id)}"><img src="${esc(imageOf(p))}" alt=""><a href="${productUrl(p)}">${esc(p.title)}</a><button type="button" class="link muted" data-act="cmp">Убрать</button></th>`).join('')}</tr></thead>
          <tbody>${rows.map(([label, vals]) => `<tr class="${list.length > 1 && new Set(vals).size > 1 ? 'is-diff' : ''}"><th scope="row">${esc(label)}</th>${vals.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p class="hint">Отличающиеся параметры подсвечены. Показаны характеристики, общие хотя бы для двух товаров.</p>
        <button type="button" class="link muted" data-clear-compare>Очистить сравнение</button>`;
    },
    request() {
      const rows = store.request();
      if (!rows.length) return `<h2 id="drawer-title">Заявка</h2>${empty('В заявке пока нет позиций', 'Добавьте товары из каталога — менеджер подтвердит наличие, сроки и персональные цены.')}`;
      const total = rows.reduce((s, r) => s + store.byId(r.id).price * r.qty, 0);
      const ask = rows.some(r => !store.byId(r.id).price);
      return `<h2 id="drawer-title">Заявка</h2>
        <ul class="mini-list">${rows.map(r => miniRow(store.byId(r.id), `
          <div class="qty" role="group" aria-label="Количество">
            <button type="button" data-qty="-1" aria-label="Меньше">−</button>
            <input type="number" inputmode="numeric" min="0" max="9999" value="${r.qty}" data-qty-input aria-label="Количество, шт.">
            <button type="button" data-qty="1" aria-label="Больше">+</button>
          </div>`)).join('')}</ul>
        <p class="total"><span>Ориентир по МРЦ${ask ? '*' : ''}</span><b>${money(total)}</b></p>
        <p class="hint">${ask ? '* Без позиций с ценой по запросу. ' : ''}Итоговые цены и сроки подтвердит менеджер. Отправка заявки не является договором или оплатой.</p>
        <form class="request-form" id="request-form" novalidate>
          <div class="field"><label for="rq-company">Организация</label><input id="rq-company" name="company" autocomplete="organization" required></div>
          <div class="field"><label for="rq-inn">ИНН</label><input id="rq-inn" name="inn" inputmode="numeric" pattern="\\d{10}|\\d{12}" required></div>
          <div class="field"><label for="rq-name">Контактное лицо</label><input id="rq-name" name="name" autocomplete="name" required></div>
          <div class="field"><label for="rq-phone">Телефон</label><input id="rq-phone" name="phone" type="tel" autocomplete="tel" required></div>
          <div class="field"><label for="rq-email">Email</label><input id="rq-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="rq-comment">Комментарий</label><textarea id="rq-comment" name="comment" rows="2" placeholder="Сроки, адрес доставки, вопросы"></textarea></div>
          <label class="check"><input type="checkbox" name="consent" required><span>Согласен на <a href="${MAIN_SITE}/consent-personal-data.html">обработку персональных данных</a> и с <a href="${MAIN_SITE}/request-terms.html">условиями заявки</a></span></label>
          <p class="form-msg" role="alert"></p>
          <button type="submit" class="button button-dark button-wide">Отправить менеджеру</button>
        </form>`;
    },
    sent(id) {
      return `<h2 id="drawer-title">Заявка сформирована</h2>
        <div class="empty is-success">${icon.check}<p class="empty-title">№ ${esc(id)}</p>
        <p>Это демонстрационный режим: заявка сохранена только в этом браузере и менеджеру пока не отправлена. Канал передачи (почта, Telegram или CRM) подключается на этапе backend.</p>
        <button type="button" class="button button-ghost" data-close>Готово</button></div>`;
    }
  };

  const renderDrawer = (kind = drawerKind, arg) => {
    drawerKind = kind;
    drawer.classList.toggle('is-wide', kind === 'compare');
    drawerBody.innerHTML = views[kind](arg);
  };
  const openDrawer = kind => {
    lastFocus = document.activeElement;
    setMenu(false);
    renderDrawer(kind);
    drawer.hidden = backdrop.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add('is-open'); backdrop.classList.add('is-open'); });
    document.body.classList.add('is-locked');
    drawer.querySelector('.drawer-close').focus();
  };
  const closeDrawer = () => {
    if (!drawerKind) return;
    drawerKind = null;
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => { if (!drawerKind) drawer.hidden = backdrop.hidden = true; }, 300);
    if (lastFocus) lastFocus.focus();
  };

  /* ---------- видеоплеер ---------- */
  const player = document.getElementById('player');
  const playerFrame = document.getElementById('player-frame');
  let playerFocus = null;
  const openVideo = id => {
    playerFocus = document.activeElement;
    playerFrame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0" title="Видео APEXWOLT" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    player.hidden = false;
    document.body.classList.add('is-locked');
    player.querySelector('.player-close').focus();
  };
  const closeVideo = () => {
    if (player.hidden) return;
    player.hidden = true;
    playerFrame.innerHTML = '';
    document.body.classList.remove('is-locked');
    if (playerFocus) playerFocus.focus();
  };
  player.addEventListener('click', e => { if (e.target === player || e.target.closest('.player-close')) closeVideo(); });

  document.addEventListener('click', e => {
    const video = e.target.closest('[data-video]');
    if (video) { openVideo(video.dataset.video); return; }
    const opener = e.target.closest('[data-open]');
    if (opener) { openDrawer(opener.dataset.open); return; }
    if (e.target.closest('[data-close]') || e.target === backdrop) closeDrawer();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!player.hidden) closeVideo(); else if (drawerKind) closeDrawer(); else setMenu(false); }
    if (e.key === 'Tab' && drawerKind) {
      const f = [...drawer.querySelectorAll('a[href],button,input,textarea,select')].filter(el => !el.disabled && el.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  drawer.addEventListener('click', e => {
    const row = e.target.closest('[data-id]');
    const qtyBtn = e.target.closest('[data-qty]');
    if (qtyBtn && row) store.setQty(row.dataset.id, store.qty(row.dataset.id) + Number(qtyBtn.dataset.qty));
    if (e.target.closest('[data-clear-compare]')) store.clearCompare();
  });
  drawer.addEventListener('change', e => {
    if (e.target.matches('[data-qty-input]')) store.setQty(e.target.closest('[data-id]').dataset.id, e.target.value);
  });
  drawer.addEventListener('submit', e => {
    if (e.target.id !== 'request-form') return;
    e.preventDefault();
    const form = e.target;
    const msg = form.querySelector('.form-msg');
    const bad = [...form.elements].find(el => el.willValidate && !el.checkValidity());
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    if (bad) {
      bad.classList.add('is-invalid');
      msg.textContent = bad.type === 'checkbox' ? 'Нужно согласие на обработку данных.'
        : bad.name === 'inn' ? 'ИНН — 10 цифр для организации или 12 для ИП.'
        : bad.type === 'email' && bad.value ? 'Проверьте email.' : 'Заполните обязательные поля.';
      bad.focus();
      return;
    }
    const id = `AW-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    try {
      const log = JSON.parse(localStorage.getItem('apx-sent') || '[]');
      log.push({ id, at: new Date().toISOString(), items: store.request() });
      localStorage.setItem('apx-sent', JSON.stringify(log));
    } catch { /* без истории */ }
    store.clearRequest();
    drawerBody.innerHTML = views.sent(id);
    drawerKind = 'sent';
  });

  /* ---------- общие действия карточек ---------- */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    const holder = btn && btn.closest('[data-id]');
    if (!btn || !holder) return;
    const id = holder.dataset.id;
    const p = store.byId(id);
    if (!p) return;
    if (btn.dataset.act === 'fav') toast(store.toggleFavorite(id) ? 'Добавлено в избранное' : 'Убрано из избранного');
    if (btn.dataset.act === 'cmp') {
      const r = store.toggleCompare(id);
      toast(r === null ? `В сравнении уже ${store.COMPARE_LIMIT} товара — уберите один` : r ? 'Добавлено к сравнению' : 'Убрано из сравнения');
    }
    if (btn.dataset.act === 'req') { store.addToRequest(id); toast(`${p.title} — в заявке`); }
  });

  /* ---------- подписка ---------- */
  document.getElementById('subscribe').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, msg = f.querySelector('.form-msg');
    msg.classList.remove('is-ok');
    if (!f.email.checkValidity()) { msg.textContent = 'Укажите корректный email.'; f.email.focus(); return; }
    if (!f.consent.checked) { msg.textContent = 'Нужно согласие на рассылку.'; return; }
    msg.textContent = 'Готово! Адрес сохранён (демо: рассылка подключается на этапе backend).';
    msg.classList.add('is-ok');
    f.reset();
  });

  // Перерисовка карточек на странице после изменения избранного/сравнения/заявки — сохраняем фокус.
  const refreshCards = () => {
    const active = document.activeElement;
    const card = active && active.closest('.card[data-id]');
    const act = active && active.dataset.act;
    const scope = card && card.parentElement;
    document.querySelectorAll('.card[data-id]').forEach(old => {
      const p = store.byId(old.dataset.id);
      const tpl = document.createElement('template');
      tpl.innerHTML = productCard(p, { compact: old.classList.contains('is-compact') }).trim();
      old.replaceWith(tpl.content.firstElementChild);
    });
    if (card && act && scope) {
      const again = scope.querySelector(`.card[data-id="${CSS.escape(card.dataset.id)}"] [data-act="${act}"]`);
      if (again) again.focus();
    }
  };

  store.onChange(() => {
    syncCounts();
    refreshCards();
    if (drawerKind && drawerKind !== 'sent') {
      const active = document.activeElement && document.activeElement.closest('#drawer [data-id]');
      const focusId = active && active.dataset.id;
      const isInput = document.activeElement && document.activeElement.matches('[data-qty-input]');
      renderDrawer();
      if (focusId) {
        const again = drawer.querySelector(`[data-id="${CSS.escape(focusId)}"] ${isInput ? '[data-qty-input]' : 'button'}`);
        if (again) again.focus();
      }
    }
  });
  syncCounts();

  window.ApexUI = { esc, money, plural, icon, summary, specPair, stockLabel, priceBlock, productCard, productUrl, imageOf, toast, findProducts, sectionOf, videoBlock, docsBlock, reduceMotion, PLACEHOLDER };
  // Одновременно играет только один ролик.
  document.addEventListener('play', e => {
    if (!e.target.closest || !e.target.closest('.clip')) return;
    document.querySelectorAll('.clip video').forEach(v => { if (v !== e.target) v.pause(); });
  }, true);
  document.querySelectorAll('[data-docs-block]').forEach(el => { el.outerHTML = docsBlock(); });
})();

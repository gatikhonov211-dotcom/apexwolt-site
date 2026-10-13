/* Карточка товара: фото, ключевые характеристики, МРЦ, закрытая цена партнёра, описание,
   полный список характеристик, похожие товары из той же категории и направления. */
(function () {
  const { products, categories, novelties } = window.APEX_DATA;
  const { esc, money, icon, summary, specPair, stockLabel, productCard, imageOf, sectionOf, priceKind } = window.ApexUI;
  const store = window.ApexStore;
  const root = document.getElementById('product-root');
  const crumbs = document.getElementById('breadcrumbs');
  const p = store.byId(new URLSearchParams(location.search).get('id'));

  if (!p) {
    document.title = 'Товар не найден — APEXWOLT';
    crumbs.insertAdjacentHTML('beforeend', '<span aria-hidden="true">/</span><span aria-current="page">Не найдено</span>');
    root.innerHTML = `<div class="empty empty-wide"><p class="empty-title">Такого товара нет</p>
      <p>Возможно, ссылка устарела или позиция снята с продажи. Найдите похожие товары в каталоге.</p>
      <a class="button button-dark" href="catalog.html">В каталог</a></div>`;
    return;
  }

  const cat = categories[p.category];
  const section = sectionOf(p);
  document.title = `${p.name} — артикул ${p.sku} | APEXWOLT`;
  document.querySelector('meta[name="description"]').content = `${p.name}. ${summary(p)}.${p.price ? ` ${priceKind(p)} ${money(p.price)}.` : ''}`;
  crumbs.insertAdjacentHTML('beforeend', `
    <span aria-hidden="true">/</span><a href="category.html?section=${section.key}">${esc(section.title)}</a>
    <span aria-hidden="true">/</span><a href="category.html?category=${p.category}">${esc(cat.title)}</a>
    <span aria-hidden="true">/</span><span aria-current="page">${esc(p.title)}</span>`);

  const pairs = p.specs.map(specPair);
  const keyFacts = pairs.filter(([k, v]) => k && v.length <= 40).slice(0, 6);
  const related = products
    .filter(x => x.id !== p.id && sectionOf(x).key === section.key)
    .sort((a, b) => (b.category === p.category) - (a.category === p.category) || (!!b.image - !!a.image) || Math.abs(a.price - p.price) - Math.abs(b.price - p.price))
    .slice(0, 4);

  // Галерея: номер текущего фото переживает перерисовку (избранное, количество в заявке).
  const shots = p.images || [];
  let shot = 0;
  const showShot = (i, focusSel) => {
    shot = (i + shots.length) % shots.length;
    render();
    const again = focusSel && root.querySelector(focusSel);
    if (again) again.focus();
    const thumb = root.querySelector('.thumb.is-on');
    if (thumb) thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const render = () => {
    const fav = store.isFavorite(p.id), cmp = store.inCompare(p.id), qty = store.qty(p.id);
    root.innerHTML = `
    <article class="pdp" data-id="${esc(p.id)}">
      <div class="pdp-gallery">
        <div class="pdp-media${p.image ? '' : ' is-placeholder'}">
          <img id="pdp-shot" src="${esc(shots.length ? shots[shot] : imageOf(p))}" alt="${p.image ? `${esc(p.title)} — фото ${shot + 1} из ${shots.length}` : 'Фото товара скоро появится'}" width="900" height="900">
          <div class="card-flags">${novelties.includes(p.id) ? '<span class="flag flag-new">Новинка</span>' : ''}${p.price ? `<span class="flag">${priceKind(p)}</span>` : ''}</div>
          ${shots.length > 1 ? `
            <button type="button" class="icon-btn shot-nav is-prev" data-shot-step="-1" aria-label="Предыдущее фото">${icon.left}</button>
            <button type="button" class="icon-btn shot-nav is-next" data-shot-step="1" aria-label="Следующее фото">${icon.right}</button>
            <span class="shot-count" aria-hidden="true">${shot + 1} / ${shots.length}</span>` : ''}
        </div>
        ${shots.length > 1 ? `<div class="thumbs" role="group" aria-label="Фото товара">${shots.map((s, i) => `
          <button type="button" class="thumb${i === shot ? ' is-on' : ''}" data-shot="${i}" aria-label="Фото ${i + 1}"${i === shot ? ' aria-current="true"' : ''}><img src="${esc(s)}" alt="" loading="lazy" width="80" height="80"></button>`).join('')}
        </div>` : ''}
      </div>
      <div class="pdp-info">
        <p class="pdp-kicker">${esc(cat.title)}${p.brand ? ` · ${esc(p.brand)}` : ''}</p>
        <h1>${esc(p.title)}</h1>
        ${p.title !== p.name ? `<p class="pdp-fullname">${esc(p.name)}</p>` : ''}
        <p class="card-sku">Артикул: ${esc(p.sku)}</p>
        ${stockLabel(p)}
        ${keyFacts.length ? `<dl class="facts">${keyFacts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        <div class="pdp-buy glass">
          <div class="price price-lg">
            ${p.price ? `<span class="muted">${priceKind(p)}</span><strong>${money(p.price)}</strong>` : '<strong class="price-ask">Цена по запросу</strong><span class="muted">Менеджер пришлёт условия в ответ на заявку</span>'}
          </div>
          <div class="locked">
            ${icon.lock}
            <div><b>Цена партнёра и маржинальность</b><span>Откроются после входа в кабинет организации</span></div>
            <a class="link" href="https://apexwolt-b2b-preview.netlify.app/account.html">Войти</a>
          </div>
          <div class="pdp-buttons">
            ${qty ? `<div class="qty qty-lg" role="group" aria-label="Количество в заявке">
                <button type="button" data-step="-1" aria-label="Меньше">−</button>
                <output aria-live="polite">${qty} шт.</output>
                <button type="button" data-step="1" aria-label="Больше">+</button>
              </div>
              <button type="button" class="button button-dark" data-open="request">Перейти к заявке</button>`
            : '<button type="button" class="button button-dark button-wide" data-act="req">Добавить в заявку</button>'}
          </div>
          <div class="pdp-secondary">
            <button type="button" class="link${fav ? ' is-on' : ''}" data-act="fav" aria-pressed="${fav}">${icon.heart}${fav ? 'В избранном' : 'В избранное'}</button>
            <button type="button" class="link${cmp ? ' is-on' : ''}" data-act="cmp" aria-pressed="${cmp}">${icon.compare}${cmp ? 'В сравнении' : 'Сравнить'}</button>
          </div>
          <p class="hint">Заявка — не оплата и не договор: менеджер подтвердит наличие, сроки и условия.</p>
        </div>
      </div>
    </article>

    ${p.description ? `<section class="pdp-section" aria-labelledby="desc-title">
      <h2 id="desc-title">Описание</h2>
      <p class="pdp-desc">${esc(p.description)}</p>
    </section>` : ''}

    <section class="pdp-section" aria-labelledby="specs-title">
      <h2 id="specs-title">Характеристики</h2>
      ${pairs.length ? `<table class="specs"><tbody>${pairs.map(([k, v]) => k
        ? `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`
        : `<tr><td colspan="2">${esc(v)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">Характеристики уточняются — менеджер пришлёт их по запросу.</p>'}
    </section>

    ${related.length ? `<section class="pdp-section" aria-labelledby="rel-title">
      <div class="block-head"><h2 id="rel-title">Похожие товары</h2><a class="link" href="category.html?category=${p.category}">Вся категория ${icon.arrow}</a></div>
      <div class="products is-grid">${related.map(x => productCard(x)).join('')}</div>
    </section>` : ''}`;
  };

  root.addEventListener('keydown', e => {
    if (shots.length < 2 || !e.target.closest('.pdp-gallery') || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    showShot(shot + (e.key === 'ArrowRight' ? 1 : -1), '.thumb.is-on');
  });
  root.addEventListener('click', e => {
    const thumb = e.target.closest('[data-shot]');
    if (thumb) { showShot(Number(thumb.dataset.shot), `[data-shot="${thumb.dataset.shot}"]`); return; }
    const nav = e.target.closest('[data-shot-step]');
    if (nav) { showShot(shot + Number(nav.dataset.shotStep), `[data-shot-step="${nav.dataset.shotStep}"]`); return; }
    const step = e.target.closest('[data-step]');
    if (step) store.setQty(p.id, store.qty(p.id) + Number(step.dataset.step));
  });
  // Карточки «Похожих» обновляет ui.js; главный блок перерисовываем сами и возвращаем фокус.
  store.onChange(() => {
    const focused = document.activeElement;
    if (!focused || !focused.closest('.pdp')) { render(); return; }
    const key = focused.dataset.step || focused.dataset.act;
    render();
    const again = root.querySelector(`.pdp [data-step="${key}"], .pdp [data-act="${key}"]`) || root.querySelector('.pdp [data-step="1"], .pdp [data-act="req"]');
    if (again) again.focus();
  });
  render();
})();

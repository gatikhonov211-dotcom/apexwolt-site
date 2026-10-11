/* Карточка товара: фото, ключевые параметры, МРЦ, закрытая цена партнёра, полный список характеристик, похожие модели. */
(function () {
  const { products } = window.APEX_DATA;
  const { esc, money, icon, summary, stockLabel, productCard } = window.ApexUI;
  const store = window.ApexStore;
  const root = document.getElementById('product-root');
  const id = new URLSearchParams(location.search).get('id');
  const p = store.byId(id);

  if (!p) {
    document.title = 'Товар не найден — APEXWOLT';
    document.getElementById('crumb-name').textContent = 'Не найдено';
    root.innerHTML = `<div class="empty empty-wide"><p class="empty-title">Такой модели нет</p>
      <p>Возможно, ссылка устарела. Вся линейка сварочного оборудования APEXWOLT — в каталоге.</p>
      <a class="button button-dark" href="index.html">В каталог</a></div>`;
    return;
  }

  document.title = `${p.name} — артикул ${p.sku} | APEXWOLT`;
  document.querySelector('meta[name="description"]').content = `${p.name}: ${summary(p)}. МРЦ ${money(p.price)}.`;
  document.getElementById('crumb-name').textContent = p.name;

  const keyFacts = [
    ['Тип сварки', p.processes.join(', ')],
    ['Сварочный ток', `${p.current[0]}–${p.current[1]} А`],
    ['Сеть', `${p.mains[0]}–${p.mains[1]} В`],
    ['ПВ', p.duty],
    p.wire.length ? ['Проволока', `${p.wire.join(' / ').replace(/\./g, ',')} мм`] : ['Электрод', `до ${p.electrode} мм`],
    ['Масса', p.weight ? `${String(p.weight).replace('.', ',')} кг` : '—']
  ];
  const splitSpec = s => { const i = s.indexOf(':'); return i > 0 ? [s.slice(0, i), s.slice(i + 1).trim()] : [s, '']; };
  const related = products.filter(x => x.id !== p.id).sort((a, b) => (b.kind === p.kind) - (a.kind === p.kind) || Math.abs(a.price - p.price) - Math.abs(b.price - p.price)).slice(0, 3);

  const render = () => {
    const fav = store.isFavorite(p.id), cmp = store.inCompare(p.id), qty = store.qty(p.id);
    root.innerHTML = `
    <article class="pdp" data-id="${esc(p.id)}">
      <div class="pdp-media">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" width="900" height="900">
        <div class="card-flags"><span class="flag">МРЦ</span></div>
      </div>
      <div class="pdp-info">
        <p class="pdp-kicker">${p.kind === 'mig' ? 'Полуавтомат MIG/MAG' : 'Инвертор MMA'} · ${esc(p.brand)}</p>
        <h1>${esc(p.name)}</h1>
        <p class="card-sku">Артикул: ${esc(p.sku)}</p>
        ${stockLabel(p)}
        <dl class="facts">${keyFacts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="pdp-buy glass">
          <div class="price price-lg">
            <span class="muted">МРЦ</span>
            <strong>${money(p.price)}</strong>
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

    <section class="pdp-section" aria-labelledby="desc-title">
      <h2 id="desc-title">Описание</h2>
      <p class="pdp-desc">${esc(p.description)}</p>
    </section>

    <section class="pdp-section" aria-labelledby="specs-title">
      <h2 id="specs-title">Характеристики</h2>
      <table class="specs"><tbody>${p.specs.map(s => { const [k, v] = splitSpec(s); return `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`; }).join('')}</tbody></table>
    </section>

    <section class="pdp-section" aria-labelledby="rel-title">
      <h2 id="rel-title">Похожие модели</h2>
      <div class="products is-grid">${related.map(productCard).join('')}</div>
    </section>`;
  };

  root.addEventListener('click', e => {
    const step = e.target.closest('[data-step]');
    if (step) store.setQty(p.id, store.qty(p.id) + Number(step.dataset.step));
  });
  store.onChange(() => {
    const focused = document.activeElement;
    const key = focused && (focused.dataset.step || focused.dataset.act);
    const inRelated = focused && focused.closest('.pdp-section .card');
    const relId = inRelated && inRelated.dataset.id;
    render();
    const again = relId ? root.querySelector(`.card[data-id="${CSS.escape(relId)}"] [data-act="${focused.dataset.act}"]`)
      : key ? root.querySelector(`.pdp [data-step="${key}"], .pdp [data-act="${key}"]`) || root.querySelector('.pdp [data-step="1"], .pdp [data-act="req"]') : null;
    if (again) again.focus();
  });
  render();
})();

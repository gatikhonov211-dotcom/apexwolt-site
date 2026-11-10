/* Кабинет партнёра: организация, статус доступа, сколько позиций с партнёрской ценой, выход. */
(function () {
  const auth = window.ApexAuth;
  const { esc, money, productCard } = window.ApexUI;
  const { products } = window.APEX_DATA;
  const root = document.getElementById('account-root');

  if (auth.isManager) { location.replace('admin.html'); return; }
  if (!auth.isPartner) { location.replace('login.html?back=account.html'); return; }

  const render = (user, prices) => {
    const c = user.company;
    const priced = prices ? products.filter(p => prices[p.sku]) : [];
    const sample = priced.filter(p => p.image).slice(0, 4);
    root.innerHTML = `
      <div class="account-head">
        <div>
          <p class="pdp-kicker">Кабинет партнёра</p>
          <h1>${esc(c.name)}</h1>
          <p class="category-lead">ИНН ${esc(c.inn)} · ${esc(c.contact)} · ${esc(user.email)}</p>
        </div>
        <button type="button" class="button button-ghost" id="logout">Выйти</button>
      </div>
      <div class="account-grid">
        <article class="account-tile"><span>Доступ</span><b class="is-ok">Открыт</b><small>Заявка ${esc(c.id)}</small></article>
        <article class="account-tile"><span>Позиции с вашей ценой</span><b>${prices ? priced.length : '…'}</b><small>${prices ? (priced.length ? 'Цена показана в каталоге и карточках товаров' : 'Менеджер ещё готовит цены — позиции появятся здесь') : 'Загружаем цены…'}</small></article>
        <article class="account-tile"><span>Менеджер</span><b>+7 (933) 023-88-43</b><small><a class="link" href="mailto:idea@apexwolt.ru">idea@apexwolt.ru</a></small></article>
      </div>
      ${sample.length ? `<section class="account-sample"><div class="block-head"><h2>Ваши цены в каталоге</h2><a class="link" href="catalog.html">Весь каталог</a></div>
        <div class="products is-grid">${sample.map(p => productCard(p)).join('')}</div></section>` : ''}
      <p class="hint">Цены партнёра действуют для вашей организации и подтверждаются менеджером в ответ на заявку. Заявка — не оплата и не договор.</p>`;
    document.getElementById('logout').addEventListener('click', () => auth.logout());
  };

  render(auth.user, null);
  auth.api('/api/me')
    .then(json => { auth.updateUser(json.user); return auth.loadPrices(); })
    .then(prices => render(auth.user, prices || {}))
    .catch(err => {
      if (err.status === 401) { location.replace('login.html?back=account.html'); return; }
      root.innerHTML = `<div class="empty empty-wide"><b>Кабинет временно недоступен</b><span>${esc(err.message)}</span><button type="button" class="button button-dark" onclick="location.reload()">Обновить</button></div>`;
    });
})();

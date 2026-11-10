/* Сессия кабинета: токен входа, запросы к API и цены партнёра.
   Токен хранится в localStorage (вход на 30 дней); цены — в sessionStorage на 10 минут.
   Права и цены всегда проверяет сервер: в браузере нет закупочной стоимости и коэффициентов. */
(function () {
  const API = window.APEX_API || '';
  const TOKEN = 'apex.auth.token';
  const USER = 'apex.auth.user';
  const PRICES = 'apex.partner.prices';
  const PRICES_TTL = 10 * 60_000;

  const read = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
  const write = (storage, key, value) => { try { value == null ? storage.removeItem(key) : storage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ } };

  let token = read(localStorage, TOKEN);
  let user = read(localStorage, USER);
  let prices = null;
  let pricesFailed = false;
  const cached = read(sessionStorage, PRICES);
  if (token && cached && cached.token === token && Date.now() - cached.at < PRICES_TTL) prices = cached.prices;

  async function api(path, { method = 'GET', body } = {}) {
    if (!API) throw new Error('Кабинет пока недоступен');
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch { throw new Error('Нет связи с сервером — проверьте интернет и попробуйте ещё раз'); }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && token) logout(false);
    if (!res.ok || json.ok === false) throw Object.assign(new Error(json.error || 'Сервис временно недоступен'), { status: res.status, data: json });
    return json;
  }

  function setSession(newToken, newUser) {
    token = newToken; user = newUser; prices = null;
    write(localStorage, TOKEN, token);
    write(localStorage, USER, user);
    write(sessionStorage, PRICES, null);
  }

  function logout(redirect = true) {
    setSession(null, null);
    if (redirect) location.href = 'index.html';
  }

  // Загрузить цены партнёра и сообщить страницам (событие apex:prices).
  async function loadPrices() {
    if (!token || user?.role !== 'partner') return null;
    if (prices) return prices;
    try {
      const json = await api('/api/prices');
      prices = json.ready ? json.prices : {};
      write(sessionStorage, PRICES, { token, at: Date.now(), prices });
    } catch { pricesFailed = true; /* без цен страница остаётся с МРЦ/РРЦ */ }
    document.dispatchEvent(new CustomEvent('apex:prices', { detail: prices }));
    return prices;
  }

  window.ApexAuth = {
    api, setSession, logout, loadPrices,
    updateUser(newUser) { user = newUser; write(localStorage, USER, user); },
    get user() { return user; },
    get isPartner() { return Boolean(token && user?.role === 'partner'); },
    get isManager() { return Boolean(token && user?.role === 'manager'); },
    // Цена партнёра по артикулу: число; false — для артикула цены нет; null — цены ещё загружаются; undefined — не партнёр.
    partnerPrice(sku) { return !this.isPartner ? undefined : !prices ? (pricesFailed ? false : null) : prices[sku] ?? false; },
    homeUrl() { return this.isManager ? 'admin.html' : this.isPartner ? 'account.html' : 'login.html'; }
  };

  if (token && user?.role === 'partner') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadPrices);
    else loadPrices();
  }
})();

/* Локальное состояние: избранное, сравнение, заявка. Только localStorage — это прототип без backend. */
(function () {
  const KEYS = { fav: 'apx-weld-fav', cmp: 'apx-weld-compare', req: 'apx-weld-request' };
  const COMPARE_LIMIT = 4;
  const listeners = new Set();

  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим — живём в памяти */ }
    memory[key] = value;
    listeners.forEach(fn => fn());
  };
  const memory = {
    [KEYS.fav]: read(KEYS.fav, []),
    [KEYS.cmp]: read(KEYS.cmp, []),
    [KEYS.req]: read(KEYS.req, {})
  };

  const byId = id => window.APEX_DATA.products.find(p => p.id === id);
  const toggleIn = (key, id, limit) => {
    const list = memory[key].slice();
    const i = list.indexOf(id);
    if (i >= 0) { list.splice(i, 1); write(key, list); return false; }
    if (limit && list.length >= limit) return null;
    list.push(id); write(key, list); return true;
  };

  window.ApexStore = {
    COMPARE_LIMIT,
    byId,
    onChange: fn => listeners.add(fn),
    favorites: () => memory[KEYS.fav].filter(byId),
    isFavorite: id => memory[KEYS.fav].includes(id),
    toggleFavorite: id => toggleIn(KEYS.fav, id),
    compare: () => memory[KEYS.cmp].filter(byId),
    inCompare: id => memory[KEYS.cmp].includes(id),
    toggleCompare: id => toggleIn(KEYS.cmp, id, COMPARE_LIMIT),
    clearCompare: () => write(KEYS.cmp, []),
    request: () => Object.entries(memory[KEYS.req]).filter(([id]) => byId(id)).map(([id, qty]) => ({ id, qty })),
    qty: id => memory[KEYS.req][id] || 0,
    setQty: (id, qty) => {
      const next = { ...memory[KEYS.req] };
      const n = Math.max(0, Math.min(9999, Math.round(Number(qty) || 0)));
      if (n) next[id] = n; else delete next[id];
      write(KEYS.req, next);
    },
    addToRequest: id => window.ApexStore.setQty(id, (memory[KEYS.req][id] || 0) + 1),
    clearRequest: () => write(KEYS.req, {})
  };

  window.addEventListener('storage', e => {
    if (!Object.values(KEYS).includes(e.key)) return;
    memory[e.key] = read(e.key, e.key === KEYS.req ? {} : []);
    listeners.forEach(fn => fn());
  });
})();

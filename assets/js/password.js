/* Блок «Пароль для входа» в кабинете партнёра и менеджера: задать или сменить пароль.
   Монтируется в #password-root; если адрес страницы заканчивается на #password — блок раскрыт и в фокусе.
   Кнопки [data-pw-toggle] (и на странице входа) показывают/скрывают пароль. */
(function () {
  const auth = window.ApexAuth;

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pw-toggle]');
    if (!b) return;
    const input = document.getElementById(b.dataset.pwToggle);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', show);
    b.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });

  const root = document.getElementById('password-root');
  if (!root || !auth || !auth.user) return;

  const field = (id, label, autocomplete) => `
    <div class="field"><label for="${id}">${label}</label>
      <div class="pw-wrap"><input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" minlength="8" maxlength="128" required>
      <button type="button" class="pw-toggle" aria-label="Показать пароль" aria-pressed="false" data-pw-toggle="${id}"></button></div></div>`;

  function render(open) {
    const has = Boolean(auth.user.hasPassword);
    root.innerHTML = `
      <section class="admin-block pw-block" id="password" aria-labelledby="pw-title">
        <div class="block-head"><h2 id="pw-title">Пароль для входа</h2></div>
        <div class="partner-form">
          <p class="admin-note">${has
            ? 'Пароль задан — входите по email и паролю. Код из письма остаётся запасным способом, если пароль забыли.'
            : 'Пароль не задан — сейчас вход только по коду из письма. Задайте пароль, чтобы входить быстрее.'}</p>
          ${open ? `<form id="pw-form" novalidate>
            <input type="email" name="username" autocomplete="username" value="${window.ApexUI.esc(auth.user.email)}" hidden>
            <div class="field-row">${field('pw-new', has ? 'Новый пароль' : 'Пароль', 'new-password')}${field('pw-repeat', 'Повторите пароль', 'new-password')}</div>
            <p class="admin-note">Не короче 8 символов, не только цифры.</p>
            <p class="form-msg" id="pw-msg" role="alert"></p>
            <div class="pw-actions"><button type="submit" class="button button-dark">${has ? 'Сменить пароль' : 'Сохранить пароль'}</button>
            ${has ? '<button type="button" class="button button-ghost" id="pw-cancel">Отмена</button>' : ''}</div>
          </form>` : `<button type="button" class="button button-ghost" id="pw-open">${has ? 'Сменить пароль' : 'Задать пароль'}</button>`}
        </div>
      </section>`;
    document.getElementById('pw-open')?.addEventListener('click', () => { render(true); document.getElementById('pw-new').focus(); });
    document.getElementById('pw-cancel')?.addEventListener('click', () => render(false));
    document.getElementById('pw-form')?.addEventListener('submit', submit);
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById('pw-msg');
    const say = (text, kind = 'error') => { msg.textContent = text; msg.className = `form-msg is-${kind}`; };
    const password = form.elements['pw-new'].value;
    if (password.length < 8) { say('Пароль — не короче 8 символов'); form.elements['pw-new'].focus(); return; }
    if (/^\d+$/.test(password)) { say('Слишком простой пароль — добавьте буквы'); form.elements['pw-new'].focus(); return; }
    if (password !== form.elements['pw-repeat'].value) { say('Пароли не совпадают'); form.elements['pw-repeat'].focus(); return; }
    form.querySelectorAll('button, input').forEach(x => { x.disabled = true; });
    say('Сохраняем…', 'info');
    try {
      const json = await auth.api('/api/auth/password', { method: 'POST', body: { password } });
      auth.updateUser({ ...auth.user, ...json.user });
      if (location.hash === '#password') history.replaceState(null, '', location.pathname + location.search);
      render(false);
      window.ApexUI.toast('Пароль сохранён — теперь можно входить по email и паролю');
    } catch (err) {
      if (err.status === 401) { location.replace('login.html'); return; }
      form.querySelectorAll('button, input').forEach(x => { x.disabled = false; });
      say(err.message);
    }
  }

  // Свежие данные (hasPassword) — с сервера; до ответа показываем то, что сохранено при входе.
  const openNow = location.hash === '#password';
  render(openNow);
  if (openNow) setTimeout(() => { root.scrollIntoView({ block: 'start', behavior: 'smooth' }); document.getElementById('pw-new')?.focus({ preventScroll: true }); }, 300);
  auth.api('/api/me').then(json => {
    const changed = json.user.hasPassword !== auth.user.hasPassword;
    auth.updateUser({ ...auth.user, ...json.user });
    if (changed && !document.getElementById('pw-form')) render(false);
  }).catch(() => { /* ошибки входа обрабатывает сама страница кабинета */ });
})();

/* Вход в кабинет: по паролю (если задан в кабинете) или по одноразовому коду из письма.
   Менеджер попадает в admin.html, партнёр — в кабинет или откуда пришёл.
   После входа без заданного пароля кабинет открывается на блоке «Пароль для входа». */
(function () {
  const auth = window.ApexAuth;
  const passForm = document.getElementById('login-pass');
  const emailForm = document.getElementById('login-email');
  const codeForm = document.getElementById('login-code');
  const passMsg = document.getElementById('lg-pw-msg');
  const emailMsg = document.getElementById('lg-email-msg');
  const codeMsg = document.getElementById('lg-code-msg');
  const resend = document.getElementById('lg-resend');
  const back = new URLSearchParams(location.search).get('back');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const LAST = 'apex.auth.lastEmail';
  let email = '';
  let timer;

  if (auth.user && (auth.isPartner || auth.isManager)) { location.replace(auth.homeUrl()); return; }

  const say = (el, text, kind = 'error') => { el.textContent = text; el.className = `form-msg is-${kind}`; };
  const busy = (form, on) => form.querySelectorAll('button, input').forEach(x => { x.disabled = on; });
  const remember = value => { try { localStorage.setItem(LAST, value); } catch { /* приватный режим */ } };
  const lastEmail = (() => { try { return localStorage.getItem(LAST) || ''; } catch { return ''; } })();

  function enter(json, msgEl) {
    auth.setSession(json.token, json.user);
    remember(json.user.email);
    say(msgEl, 'Готово, открываем кабинет…', 'ok');
    const safeBack = back && /^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(back) ? back : null;
    const home = json.user.role === 'manager' ? 'admin.html' : 'account.html';
    location.replace(!json.user.hasPassword ? `${home}#password` : json.user.role === 'manager' ? home : safeBack || home);
  }

  // Переключение способов входа; введённый email переносится между формами.
  function show(form) {
    clearInterval(timer);
    const current = [passForm, emailForm, codeForm].find(f => !f.hidden);
    const typed = current?.elements.email?.value.trim() || email;
    [passForm, emailForm, codeForm].forEach(f => { f.hidden = f !== form; });
    if (form.elements.email && typed && !form.elements.email.value) form.elements.email.value = typed;
    (form.elements.email && !form.elements.email.value ? form.elements.email : form.elements.password || form.elements.email).focus();
  }
  document.querySelectorAll('[data-to-code]').forEach(b => b.addEventListener('click', () => show(emailForm)));
  document.querySelectorAll('[data-to-pass]').forEach(b => b.addEventListener('click', () => show(passForm)));

  /* ---------- пароль ---------- */
  if (lastEmail) passForm.elements.email.value = lastEmail;

  passForm.addEventListener('submit', async e => {
    e.preventDefault();
    const em = passForm.elements.email.value.trim().toLowerCase();
    const password = passForm.elements.password.value;
    if (!EMAIL_RE.test(em)) { say(passMsg, 'Проверьте email'); passForm.elements.email.focus(); return; }
    if (!password) { say(passMsg, 'Введите пароль'); passForm.elements.password.focus(); return; }
    busy(passForm, true);
    say(passMsg, 'Проверяем…', 'info');
    try {
      enter(await auth.api('/api/auth/login', { method: 'POST', body: { email: em, password } }), passMsg);
    } catch (err) {
      say(passMsg, err.message);
      busy(passForm, false);
      passForm.elements.password.select();
    }
  });

  /* ---------- код из письма ---------- */
  const cooldown = seconds => {
    clearInterval(timer);
    let left = seconds;
    resend.disabled = true;
    const tick = () => {
      resend.textContent = left > 0 ? `Отправить ещё раз через ${left} с` : 'Отправить код ещё раз';
      if (left-- <= 0) { clearInterval(timer); resend.disabled = false; }
    };
    tick();
    timer = setInterval(tick, 1000);
  };

  async function requestCode() {
    const json = await auth.api('/api/auth/request', { method: 'POST', body: { email } });
    document.getElementById('lg-sent-to').textContent = email;
    emailForm.hidden = true;
    codeForm.hidden = false;
    say(codeMsg, json.message, 'info');
    cooldown(60);
    codeForm.elements.code.focus();
  }

  emailForm.addEventListener('submit', async e => {
    e.preventDefault();
    email = emailForm.elements.email.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { say(emailMsg, 'Проверьте email'); emailForm.elements.email.focus(); return; }
    busy(emailForm, true);
    say(emailMsg, 'Отправляем код…', 'info');
    try { await requestCode(); say(emailMsg, ''); }
    catch (err) { say(emailMsg, err.message); }
    finally { busy(emailForm, false); }
  });

  codeForm.elements.code.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (e.target.value.length === 6) codeForm.requestSubmit();
  });

  codeForm.addEventListener('submit', async e => {
    e.preventDefault();
    const code = codeForm.elements.code.value;
    if (!/^\d{6}$/.test(code)) { say(codeMsg, 'Введите 6 цифр из письма'); return; }
    busy(codeForm, true);
    say(codeMsg, 'Проверяем…', 'info');
    try {
      enter(await auth.api('/api/auth/verify', { method: 'POST', body: { email, code } }), codeMsg);
    } catch (err) {
      say(codeMsg, err.message);
      busy(codeForm, false);
      codeForm.elements.code.select();
    }
  });

  resend.addEventListener('click', async () => {
    resend.disabled = true;
    try { await requestCode(); } catch (err) { say(codeMsg, err.message); if (err.status !== 429) resend.disabled = false; }
  });

  document.getElementById('lg-change').addEventListener('click', () => {
    codeForm.elements.code.value = '';
    emailForm.elements.email.value = '';
    email = '';
    show(emailForm);
  });
})();

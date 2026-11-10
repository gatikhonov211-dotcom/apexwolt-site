/* Вход по коду из письма: email → код → токен. Менеджер попадает в admin.html, партнёр — в кабинет или откуда пришёл. */
(function () {
  const auth = window.ApexAuth;
  const emailForm = document.getElementById('login-email');
  const codeForm = document.getElementById('login-code');
  const emailMsg = document.getElementById('lg-email-msg');
  const codeMsg = document.getElementById('lg-code-msg');
  const resend = document.getElementById('lg-resend');
  const back = new URLSearchParams(location.search).get('back');
  let email = '';
  let timer;

  if (auth.user && (auth.isPartner || auth.isManager)) { location.replace(auth.homeUrl()); return; }

  const say = (el, text, kind = 'error') => { el.textContent = text; el.className = `form-msg is-${kind}`; };
  const busy = (form, on) => form.querySelectorAll('button, input').forEach(x => { x.disabled = on; });

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say(emailMsg, 'Проверьте email'); emailForm.elements.email.focus(); return; }
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
      const json = await auth.api('/api/auth/verify', { method: 'POST', body: { email, code } });
      auth.setSession(json.token, json.user);
      say(codeMsg, 'Готово, открываем кабинет…', 'ok');
      const safeBack = back && /^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(back) ? back : null;
      location.replace(json.user.role === 'manager' ? 'admin.html' : safeBack || 'account.html');
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
    clearInterval(timer);
    codeForm.hidden = true;
    emailForm.hidden = false;
    codeForm.elements.code.value = '';
    emailForm.elements.email.focus();
  });
})();

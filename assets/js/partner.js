/* Страница «Стать партнёром»: автозаполнение реквизитов по ИНН (через backend → DaData) и отправка заявки. */
(function () {
  const API = window.APEX_API;
  const form = document.getElementById('partner-form');
  const f = name => form.elements[name];
  const innMsg = document.getElementById('pf-inn-msg');
  const formMsg = document.getElementById('pf-msg');
  const findBtn = document.getElementById('pf-find');
  const submitBtn = document.getElementById('pf-submit');

  // Та же проверка контрольных цифр, что и на сервере (backend/inn.mjs) — без лишних запросов.
  const isValidInn = s => {
    if (!/^\d{10}(\d{2})?$/.test(s)) return false;
    const d = [...s].map(Number);
    const c = w => w.reduce((sum, k, i) => sum + k * d[i], 0) % 11 % 10;
    if (d.length === 10) return c([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
    return c([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] && c([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
  };
  const setMsg = (el, text, kind = 'error') => { el.textContent = text; el.className = `${el.id === 'pf-msg' ? 'form-msg' : 'field-msg'} is-${kind}`; };

  if (!API) {
    setMsg(formMsg, 'Онлайн-регистрация скоро заработает. Пока оставьте заявку менеджеру по телефону +7 (933) 023-88-43 или на idea@apexwolt.ru.', 'info');
    findBtn.disabled = true;
    submitBtn.disabled = true;
  }

  f('inn').addEventListener('input', () => {
    f('inn').value = f('inn').value.replace(/\D/g, '').slice(0, 12);
    f('inn').classList.remove('is-invalid');
    innMsg.textContent = '';
  });

  const lookup = async () => {
    const inn = f('inn').value.trim();
    if (!isValidInn(inn)) { f('inn').classList.add('is-invalid'); setMsg(innMsg, 'Проверьте ИНН: 10 цифр для организации или 12 для ИП'); f('inn').focus(); return; }
    findBtn.disabled = true;
    setMsg(innMsg, 'Ищем организацию…', 'info');
    try {
      const res = await fetch(`${API}/api/company?inn=${encodeURIComponent(inn)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) { setMsg(innMsg, json.error || 'Не удалось найти организацию, заполните реквизиты вручную'); return; }
      const c = json.company;
      f('companyName').value = c.name;
      f('kpp').value = c.kpp;
      f('ogrn').value = c.ogrn;
      f('address').value = c.address;
      setMsg(innMsg, c.active ? `Найдено: ${c.name}` : `Внимание: организация ${c.statusText || 'не действует'}. Заявку могут отклонить.`, c.active ? 'ok' : 'error');
      f('contactName').focus();
    } catch {
      setMsg(innMsg, 'Сервис поиска недоступен, заполните реквизиты вручную');
    } finally {
      findBtn.disabled = !API;
    }
  };
  findBtn.addEventListener('click', lookup);
  f('inn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!API) return;
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    const bad = [...form.elements].find(el => el.willValidate && !el.checkValidity());
    if (bad || !isValidInn(f('inn').value)) {
      const target = bad || f('inn');
      target.classList.add('is-invalid');
      setMsg(formMsg, target.name === 'consent' ? 'Нужно согласие на обработку персональных данных.' : target.name === 'inn' ? 'Проверьте ИНН.' : 'Заполните обязательные поля.');
      target.focus();
      return;
    }
    const payload = Object.fromEntries(['inn', 'companyName', 'kpp', 'ogrn', 'address', 'contactName', 'position', 'email', 'phone', 'comment'].map(k => [k, f(k).value.trim()]));
    payload.consent = f('consent').checked;
    submitBtn.disabled = true;
    setMsg(formMsg, 'Отправляем…', 'info');
    try {
      const res = await fetch(`${API}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        Object.keys(json.errors || {}).forEach(k => f(k === 'consent' ? 'consent' : k)?.classList.add('is-invalid'));
        setMsg(formMsg, json.errors ? Object.values(json.errors)[0] : json.error || 'Не удалось отправить заявку');
        return;
      }
      document.getElementById('pf-id').textContent = json.id;
      form.hidden = true;
      const done = document.getElementById('partner-done');
      done.hidden = false;
      done.focus();
    } catch {
      setMsg(formMsg, 'Сервер недоступен. Попробуйте позже или позвоните менеджеру: +7 (933) 023-88-43.');
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

/* Адрес API регистрации. Локально — сервер backend/server.mjs; на сайте — адрес в Yandex Cloud
   (пока пусто: регистрация на опубликованном сайте недоступна до запуска сервера). */
window.APEX_API = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8787'
  : '';

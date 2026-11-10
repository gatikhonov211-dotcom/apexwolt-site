/* Адрес API регистрации. Локально — сервер backend/server.mjs; на сайте — Yandex Cloud API Gateway
   (функция apex-api, заявки в приватном бакете Object Storage). */
window.APEX_API = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8787'
  : 'https://d5d0b6nbhif68m8olkrp.l5v6loqa.apigw.yandexcloud.net';

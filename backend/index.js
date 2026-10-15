// Точка входа Yandex Cloud Function (entrypoint index.handler). Обработчик — ES-модуль api.mjs.
let api;
module.exports.handler = async (event, context) => {
  api ||= await import('./api.mjs');
  return api.handler(event, context);
};

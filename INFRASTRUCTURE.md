# APEXWOLT B2B — где что находится

Памятка по сайту https://b2b.apexwoltshop.ru: код, хостинг, домен, почта, данные и как публиковать.
Паролей и ключей здесь нет и быть не должно — они только в Lockbox и локальном `backend/.env` (не в Git).
Файл не публикуется на сайт (`tools/deploy-static.mjs` пропускает `*.md`).

## Код

| Что | Где |
| --- | --- |
| Репозиторий | GitHub `gatikhonov211-dotcom/apexwolt-site`, ветка `main` — то, что опубликовано |
| Рабочая копия | `C:\Users\georg\Projects\apexwolt-site` |
| Страницы | `*.html` в корне |
| Скрипты и стили | `assets/js/`, `assets/css/app.css` |
| Каталог (генерируется) | `assets/js/data.js` ← `tools/build-data.mjs` из основного проекта `apexwolt-b2b/dist` |
| Фото товаров | `assets/img/products/<модель>/`, карта папок → товаров `tools/photo-map.json` |
| Цены поверх каталога | `tools/price-overrides.json` (МРЦ/РРЦ) |
| Серверная часть | `backend/` (API, вход, письма, хранилище), тесты `backend/api.test.mjs` |
| Инструменты | `tools/` — сборка, фото, публикация (см. ниже) |

## Yandex Cloud

Облако `b2b-apexwolt` (`b1g6avrq0egs39iugdg2`), каталог `default` (`b1gsvsro1vanubnh4v4v`). Оплата — платёжный аккаунт владельца.

| Ресурс | Имя / ID | Назначение |
| --- | --- | --- |
| Object Storage, бакет | `b2b.apexwoltshop.ru` | файлы сайта, открыт как веб-сайт (index/error `index.html`) |
| Certificate Manager | `b2b-apexwoltshop-2` (`fpqmdrdu4tpes0d5cgpl`) | HTTPS, Let's Encrypt, продлевается автоматически (нужна DNS-запись `_acme-challenge.b2b`) |
| Cloud Functions | `apex-api` (`d4eblmt7l1vhsndvlnhl`), Node.js 22, `index.handler` | API: регистрация, вход, цены партнёра, заявки, кабинет менеджера |
| API Gateway | `apex-api-gw` (`d5d0b6nbhif68m8olkrp`) | адрес API `https://d5d0b6nbhif68m8olkrp.l5v6loqa.apigw.yandexcloud.net/api/…` (маршрут `/api/{route+}`, `backend/gateway.yaml`) |
| Lockbox | `apex-api-secrets` | секреты функции: `DADATA_TOKEN`, `SMTP_PASS`, `AUTH_SECRET` |
| Object Storage, бакет | `apexwolt-b2b-registrations` (приватный) | данные (см. ниже) |
| Сервисный аккаунт | `apex-api-sa` (`ajeif5gantp5rm296mc6`) | права функции: storage.editor, lockbox.payloadViewer, functions.functionInvoker |
| YDB | `apex-b2b` | не используется, можно удалить |
| Старый сертификат | `b2b-apexwoltshop` | не выпустился, не используется, можно удалить |

Переменные функции (не секретные): `MANAGER_EMAILS`, `SITE_URL`, `ALLOWED_ORIGINS`, `S3_BUCKET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM`.
Адрес API для сайта задан в `assets/js/config.js`.

### Данные (бакет `apexwolt-b2b-registrations`)

| Путь | Что |
| --- | --- |
| `registrations/<ИНН>.json` | заявки на партнёрство: реквизиты, контакт, статус, коэффициент |
| `users/<ключ email>.json` | доступ партнёра (email → организация), создаётся при одобрении |
| `passwords/<ключ email>.json` | пароли входа — только соль и хеш scrypt |
| `codes/<ключ email>.json` | одноразовые коды входа (хеш, 10 минут) |
| `costs.json` | закупочная стоимость по артикулам (загружает менеджер из Excel) |
| `orders/<дата>_<номер>.json` | заявки на товары из корзины |

Закупочная стоимость и коэффициенты в браузер не попадают: цену партнёра (закупка × коэффициент) считает сервер.

## Домен и DNS

Домен `apexwoltshop.ru` — регистратор и DNS в REG.RU. Записи для сайта:

| Запись | Тип | Значение |
| --- | --- | --- |
| `b2b` | CNAME | `b2b.apexwoltshop.ru.website.yandexcloud.net.` |
| `_acme-challenge.b2b` | CNAME | `fpqmdrdu4tpes0d5cgpl.cm.yandexcloud.net.` — **не удалять**, по ней продлевается сертификат |

В REG.RU висит напоминание об идентификации администратора домена (Госуслуги) — его нужно пройти владельцу.
Файл `CNAME` в репозитории остался от GitHub Pages и для текущего хостинга не нужен.

## Почта

- Отправитель: ящик `idea@apexwolt.ru` (Mail.ru, SMTP `smtp.mail.ru:465`), пароль приложения — в Lockbox `SMTP_PASS`.
- Получатели уведомлений (заявки на партнёрство и на товары): `MANAGER_EMAILS` — georgyitikhonov@mail.ru, idea@apexwolt.ru.
- Клиенту уходят: подтверждение заявки, код входа, «доступ открыт».
- Если сменить пароль ящика — создать новый пароль приложения и новую версию секрета Lockbox, затем обновить функцию.

## Внешние сервисы

- DaData — реквизиты организации по ИНН на странице «Стать партнёром» (токен в Lockbox `DADATA_TOKEN`).
- Исходные фото — Яндекс Диск «Каталог ООО «ГРАНИТ»» (папки APEXWOLT, SUMO, VOLTEXA).

## Кабинеты и доступ

- Менеджеры — адреса из `MANAGER_EMAILS`, вход на https://b2b.apexwoltshop.ru/login.html (код из письма или пароль).
- Кабинет менеджера `admin.html`: заявки на товары (статусы), заявки на партнёрство (одобрить с коэффициентом / закрыть доступ), загрузка закупочной стоимости из Excel.
- Партнёры входят после одобрения; пароль задают в кабинете.

## Как публиковать

Нужен [Yandex Cloud CLI](https://yandex.cloud/ru/docs/cli/) (`yc`), вошедший в аккаунт владельца облака; ключи не нужны — используется IAM-токен `yc`.

```bash
node tools/build-data.mjs ../apexwolt-b2b/dist        # если менялись каталог, фото или скрипты (метки версий)
cd backend && node --test && cd ..                     # тесты серверной части
git push origin main
YC_BIN=<путь к yc> node tools/deploy-static.mjs origin/main   # сайт → бакет b2b.apexwoltshop.ru
YC_BIN=<путь к yc> node tools/deploy-function.mjs HEAD        # только если менялся backend/
```

`deploy-static.mjs` синхронизирует бакет с файлами из Git (без `backend/`, `tools/`, `*.md`), удаляет лишнее.
`deploy-function.mjs` создаёт новую версию `apex-api`, сохраняя переменные и секреты текущей.

Локальная проверка: `npx serve . -l 4180` (сайт) и `npm run api` (API на :8787, настройки в `backend/.env`, `MAIL_MOCK=1` — письма в `backend/data/outbox`).

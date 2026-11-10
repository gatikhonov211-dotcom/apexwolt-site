# APEXWOLT · B2B-сайт

Многостраничный B2B-сайт APEXWOLT: главная, каталог, категории, карточки товаров,
«О компании» с производством, видео и контактами. Статика без сборки — HTML, CSS, JavaScript.

Структура и сценарии (каталог-меню, новинки, подборки, фильтр по параметрам, сравнение,
заявка, подписка, мобильная нижняя навигация) — собственная реализация по образцу типового
B2B-каталога. Код и тексты написаны заново; товары, фото, видео, реквизиты — APEXWOLT.

## Страницы

| файл | что это |
| --- | --- |
| `index.html` | Главная: видео-hero, направления, карусель новинок, преимущества, товары в наличии, бренды, о компании, видеообзоры |
| `catalog.html` | Все 12 направлений и 69 категорий со счётчиками |
| `category.html` | Любая выборка: `?section=…`, `?category=…`, `?brand=…`, `?q=…`, `?stock=1`, `?sort=new` |
| `product.html` | Карточка товара: `?id=apexwolt-7-65-05` |
| `about.html` | О компании: производство, поддержка партнёров, как работаем, бренды, видео, реквизиты (`#contacts`) |
| `partner.html` | «Стать партнёром»: заявка с автозаполнением реквизитов по ИНН |
| `login.html` | Вход по одноразовому коду из письма (партнёр после одобрения, менеджер) |
| `account.html` | Кабинет партнёра: организация, позиции с партнёрской ценой |
| `admin.html` | Кабинет менеджера: одобрение заявок с коэффициентом, загрузка закупочной стоимости из Excel |
| `documents.html` | Сертификаты и декларации о соответствии (PDF в `assets/docs/`), ссылка в подвале |

Общие части (шапка с мега-меню и поиском, подвал, избранное, сравнение, заявка, видеоплеер)
собираются скриптом `assets/js/ui.js` на каждой странице.

## Запуск локально

```bash
npx serve . -l 4180
```

Открыть http://localhost:4180. Файл `serve.json` отключает «чистые» адреса, чтобы
`product.html?id=…` не терял параметр.

## Данные

Каталог (264 позиции, 12 направлений, новинки) берётся из основного проекта и собирается
в `assets/js/data.js`, фото копируются в `assets/img/catalog/`:

```bash
node tools/build-data.mjs ../apexwolt-b2b/dist
```

- Источник товаров — `dist/catalog.data.js` (`categoryData`, `sectionData`).
- Список новинок — `NOVELTY_IDS` из `dist/catalog-shop.js`, на сайте показываются только позиции
  направления «Сварочное оборудование» (`NOVELTY_SECTION` в `tools/build-data.mjs`).
- Сварочные аппараты разбиты на подразделы «Сварочные инверторы» (MMA) и «Сварочные полуавтоматы»
  (MIG) — правило `SPLITS` в `tools/build-data.mjs`; исходный каталог не меняется.
- Товары без фото показываются с фирменной заглушкой `assets/img/category-placeholder.svg`.
- Фильтры «Выбор по параметрам» строятся автоматически из характеристик вида «Параметр: значение».

## Фото товаров

Исходники — Яндекс Диск («Фото 2 партии» APEXWOLT, папка теплового оборудования VOLTEXA). Скачайте их, затем:

```bash
npm install
node tools/cutout-photos.mjs <выгрузка APEXWOLT> <папка вырезок>          # фон → белый (нейросеть, локально)
node tools/process-photos.mjs <папка вырезок> apex <выгрузка APEXWOLT>    # галереи APEXWOLT
node tools/process-photos.mjs <выгрузка VOLTEXA> heat                      # галереи VOLTEXA, как есть
node tools/build-data.mjs ../apexwolt-b2b/dist
```

- `tools/photo-map.json` — папка → артикулы; `order` — порядок (товар, затем коробка и кейс);
  `original` — фото, для которых берётся исходник без вырезки (крупные планы белого корпуса); `lead` — главный снимок.
- `tools/cutout-photos.mjs` — вырезка фона @imgly/background-removal-node; при первой установке разрешите сборку sharp:
  `npm install-scripts approve sharp && npm rebuild sharp`.
- Товары без фото показывают заставку своего бренда (`assets/img/placeholders/`).
- Цены для сайта поверх основного каталога — `tools/price-overrides.json`.

## Регистрация партнёров (backend)

`partner.html` — заявка «Стать партнёром»: реквизиты по ИНН подставляются через DaData, заявка уходит
на сервер со статусом «на проверке». Токен DaData и персональные данные — только на сервере.

```bash
cp backend/.env.example backend/.env   # впишите DADATA_TOKEN (или DADATA_MOCK=1 для теста)
npm run api                            # API на http://localhost:8787
npm test                               # тесты API
```

- `backend/api.mjs` — обработчик (совместим с Yandex Cloud Function + API Gateway), список маршрутов — в начале файла:
  заявка, вход по коду (`auth/request`, `auth/verify`), `me`, `prices`, `admin/*`. CORS — только сайты из `ALLOWED_ORIGINS`.
- `backend/auth.mjs` — коды входа (6 цифр, 10 минут, 5 попыток, хранится только HMAC) и токен сессии на 30 дней (`AUTH_SECRET`).
  Права перепроверяются при каждом запросе: менеджер — адрес из `MANAGER_EMAILS`, партнёр — одобренная организация.
- Цена партнёра = закупочная стоимость × коэффициент организации, считается на сервере (`GET /api/prices`).
  Закупочная стоимость и коэффициенты в браузер партнёра не попадают; Excel менеджер загружает в `admin.html`
  (разбор в браузере — SheetJS 0.18.5, `assets/vendor/`, Apache-2.0).
- `backend/kv.mjs` + `store.mjs` — данные: в облаке приватный бакет Object Storage (`S3_BUCKET`), локально `backend/data/kv` (не в Git):
  `registrations/<ИНН>.json`, `users/<ключ email>.json`, `codes/…`, `costs.json`.
- `backend/mailer.mjs` — письмо менеджерам (`MANAGER_EMAILS`, ответ уходит клиенту) и подтверждение клиенту.
  Отправка по SMTP (`SMTP_*`, Yandex Cloud Postbox или почтовый ящик); `MAIL_MOCK=1` — письма в `backend/data/outbox/*.eml`.
  Адреса и пароли — только в `backend/.env` / переменных функции.
- `assets/js/config.js` — адрес API: локально `localhost:8787`, на сайте — API Gateway в Yandex Cloud.

### Yandex Cloud (облако b2b-apexwolt, каталог default)

| ресурс | имя |
| --- | --- |
| Cloud Function (nodejs22, entrypoint `index.handler`) | `apex-api` |
| API Gateway (`backend/gateway.yaml`) | `apex-api-gw` |
| Lockbox (`DADATA_TOKEN`, `SMTP_PASS`, `AUTH_SECRET`) | `apex-api-secrets` |
| Object Storage, приватный бакет заявок | `apexwolt-b2b-registrations` |
| Сервисный аккаунт (storage.editor, lockbox.payloadViewer, functions.functionInvoker) | `apex-api-sa` |

Новая версия функции — файлы `backend/` без `.env`, `data/`, тестов и `node_modules`:
`yc serverless function version create --function-name apex-api --runtime nodejs22 --entrypoint index.handler
--service-account-id <apex-api-sa> --source-path <папка> --secret name=apex-api-secrets,key=DADATA_TOKEN,environment-variable=DADATA_TOKEN
--environment S3_BUCKET=apexwolt-b2b-registrations --environment MANAGER_EMAILS=… --environment ALLOWED_ORIGINS=…`

## Структура

```
index.html, catalog.html, category.html, product.html, about.html
assets/css/app.css        стили (Golos Text, белый фон, мягкое стекло, синий акцент)
assets/js/data.js         сгенерированные данные — не править руками
assets/js/store.js        избранное, сравнение (до 4), заявка — localStorage
assets/js/ui.js           шапка, мега-меню, поиск, панели, видео, подписка, подвал, карточка товара
assets/js/home.js         главная
assets/js/category.js     категория: вкладки, фасеты, сортировка, сетка/список, пагинация
assets/js/product.js      карточка товара
assets/img/…              логотип, иконки направлений, фото товаров, производства, превью видео
assets/video/hero.mp4     фоновый ролик главной (облегчённая версия, 3,4 МБ)
tools/build-data.mjs      генератор data.js и фото
```

## Хостинг b2b.apexwoltshop.ru (Yandex Object Storage + HTTPS)

Сайт отдаётся из публичного бакета `b2b.apexwoltshop.ru` (веб-сайт, сертификат Let's Encrypt из Certificate Manager,
продлевается сам через CNAME `_acme-challenge.b2b`). DNS в REG.RU: `b2b` CNAME `b2b.apexwoltshop.ru.website.yandexcloud.net`.

```bash
git push origin main
node tools/deploy-static.mjs origin/main   # загрузить опубликованную ревизию в бакет (--dry — только показать)
```

## Публикация на GitHub

```bash
git remote add origin https://github.com/<аккаунт>/apexwolt-site.git
git push -u origin main
```

Для GitHub Pages: Settings → Pages → Deploy from a branch → `main` / root.

## Ограничения прототипа

- Корзина-заявка и подписка пока сохраняются только в браузере; на сервер уходит только заявка «Стать партнёром».
- Цена партнёра скрыта визуально; при подключении backend закрытые цены нельзя отдавать без авторизации.
- «Профиль» и правовые документы ведут на https://apexwolt-b2b-preview.netlify.app.
- У 198 из 264 товаров пока нет собственного фото. Часть исходных PNG тяжёлые (каталог ~20 МБ) — стоит сжать в WebP.
- Раздела новостей нет: публикаций у APEXWOLT пока нет, выдумывать их не стали.

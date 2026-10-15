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

- `backend/api.mjs` — обработчик (совместим с Yandex Cloud Function + API Gateway):
  `GET /api/company?inn=`, `POST /api/register`, `GET /api/health`. CORS — только сайты из `ALLOWED_ORIGINS`,
  ограничение 20 запросов ИНН в минуту с адреса, кеш ответов.
- `backend/store.mjs` — заявки в `backend/data/registrations.json` (не в Git); в облаке — YDB/PostgreSQL.
- `assets/js/config.js` — адрес API: локально `localhost:8787`, на сайте пусто, пока сервер не развёрнут
  (форма показывает телефон и почту менеджера).

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

## Публикация на GitHub

```bash
git remote add origin https://github.com/<аккаунт>/apexwolt-site.git
git push -u origin main
```

Для GitHub Pages: Settings → Pages → Deploy from a branch → `main` / root.

## Ограничения прототипа

- Нет backend: заявка и подписка сохраняются только в браузере и показывают демо-подтверждение.
- Цена партнёра скрыта визуально; при подключении backend закрытые цены нельзя отдавать без авторизации.
- «Профиль» и правовые документы ведут на https://apexwolt-b2b-preview.netlify.app.
- У 198 из 264 товаров пока нет собственного фото. Часть исходных PNG тяжёлые (каталог ~20 МБ) — стоит сжать в WebP.
- Раздела новостей нет: публикаций у APEXWOLT пока нет, выдумывать их не стали.

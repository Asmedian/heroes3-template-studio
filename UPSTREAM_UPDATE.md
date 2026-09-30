# Обновление Heroes III Template Studio из sokie/heroes3-template-util

Веб-версия — **не форк нативного PySide6 GUI**: она является отдельной реализацией той же схемы, парсеров и конвертеров на JavaScript. Обновление Python-пакета upstream **никогда не означает**, что можно просто скопировать `src/h3tc/` в веб-сайт: GitHub Pages не выполняет Python/PySide6 на сервере. Ниже процедура безопасного переноса изменений upstream.

## 1. Зафиксировать текущую базу и скачать upstream

Версия, по которой создана веб-версия 1.5.1: `sokie/heroes3-template-util` commit **`e0143ce06d5cb8d616d5facd4e05569437878a07`**, upstream package version **`0.3.0`**. Веб-проект использует MIT-лицензию upstream (см. `LICENSE`).

```bash
# From the web project root:
git status --short
git switch -c sync/upstream-YYYYMMDD
# Clone upstream NEXT TO the web project, never inside the deployed src/ folder:
cd ..
git clone https://github.com/sokie/heroes3-template-util.git
cd heroes3-template-util
git rev-parse HEAD
git log --oneline e0143ce06d5cb8d616d5facd4e05569437878a07..HEAD
```

Запишите новый SHA, версию `pyproject.toml`, дату проверки и ссылку на релиз в PR. При повторном обновлении используйте вместо закреплённого SHA тот, который уже указан в последнем обновлённом `UPSTREAM_UPDATE.md`.

## 2. Изучить изменения перед переносом

```bash
git diff --stat e0143ce06d5cb8d616d5facd4e05569437878a07..HEAD -- src/h3tc
git diff e0143ce06d5cb8d616d5facd4e05569437878a07..HEAD -- \
  src/h3tc/schema.py src/h3tc/enums.py src/h3tc/constants.py \
  src/h3tc/models.py src/h3tc/parsers src/h3tc/writers src/h3tc/converters \
  src/h3tc/editor
```

Если upstream меняет форматы, особенно порядок колонок, первые строки `header_rows`, разделители TSV, экранирование, кодировки, новые поля `ZoneOptions`, `image_settings` или HotA 1.8, это **обязательный** перенос с новыми тестовыми шаблонами. Изменения `src/h3tc/editor/` проверьте отдельно: команды undo/redo, валидация, подсказки (`hint`), раскладка, экспорт PNG, drag/drop, sidecar, новые функции GUI. Переименование констант/полей `models.py` требует синхронного обновления JavaScript-моделей.

## 3. Автоматически пересобрать схему из Python

Из каталога **веб-проекта** (`h3tc-web`), где `../heroes3-template-util` — актуальный upstream checkout:

```bash
python3 -m pip install 'pydantic>=2' 'click>=8'
python3 scripts/export_schema.py --upstream-path ../heroes3-template-util
# Both src/schema.json and src/schema-data.js are regenerated together:
git diff -- src/schema.json src/schema-data.js
```

Скрипт извлекает форматы, индексы колонок, заголовки, списки фракций/ландшафтов и SoD→HotA defaults **напрямую** из `h3tc.schema`, `h3tc.constants`, `h3tc.enums`. Для неизменившейся схемы результат идентичен побайтово. **Не редактируйте эти два выходных файла вручную.** Если Python API экспорта изменился, сначала исправьте `scripts/export_schema.py`.

## 4. Перенести неавтоматические изменения

Проверьте каждый модуль, даже если `schema-data.js` не изменился:

| Новая возможность upstream | Веб-файлы для ручного переноса |
|---|---|
| Чтение/запись/кодировки/новые колонки | `src/core.js`: `readTSV`, `parseText`, `serializePack`, `decodeBytes`, `encodeText` |
| Конвертеры SoD↔HotA, HotA 1.7↔1.8 | `src/core.js`: `sodTo17`, `hota17To18`, `hota18To17`, `hotaToSod` |
| Новые поля `Map`, `Zone`, `Connection`, `PackMetadata` | `src/core.js`, инспектор и формы `src/app.js` |
| Перенумерация, подсказки, список проверок | `src/core.js`: `renumberMap`, `remapHintRefsDetailed`, `validatePack` |
| Алгоритмы раскладки, графовые мотивы и координаты HotA | `src/layout.js`, `src/layout-motifs.js`, `src/app.js` |
| Множественные соединения и подписи охраны | `src/geometry.js`, `src/app.js`, `styles.css` |
| Sidecar `.h3tc-layout.json` | `src/sidecar.js`, экспорт/импорт `src/app.js` |
| Команды редактора, перетаскивание, экспорт | `src/app.js`, `index.html`, `styles.css` |
| Темы и размер окна, PWA | `styles.css`, `manifest.webmanifest`, `sw.js`, `public/icons/` |
| Новые иконки шахт/городов и графика шаблонов | `src/visuals.js`, `index.html` (inline SVG), `public/template-icons/`; сохраняйте отдельные SVG группы roofs/flags/gates и проверяйте права на предоставленные изображения |
| Английский/русский язык | `src/i18n.js` плюс видимые строки `src/app.js`, `index.html` |
| Каталог встроенных шаблонов | `templates/catalog.json`, `templates/*.txt`, `sw.js`; сохранить корректность SHA-256 и лицензионных прав |

**Правила совместимости:** не удаляйте лишние / неизвестные поля без диагностических предупреждений; не переписывайте неизменённые исходные файлы при обычной загрузке/сохранении; не теряйте исходную Windows-1251 кодировку, если она представима; downgrade HotA 1.8→1.7 должен сообщать о Bulwark, HotA→SoD — об утраченных HotA-only полях. Для изменения `hint` используйте только поддержанный синтаксис upstream; неизвестные подсказки оставляйте без модификаций и показывайте предупреждение.

## 5. Дополнить фикстуры и выполнить дифференциальную проверку

При новой версии/формате добавьте минимум один **реальный** шаблон нового формата в `tests/fixtures/`. Для каждого направления конвертации добавьте проверки **результирующей модели, а не только количества колонок**. Сопоставляйте JS и Python `model_dump(mode='json')` на одинаковых исходных файлах.

```bash
# Run Python upstream tests when its dependencies are installed:
cd ../heroes3-template-util
python3 -m pip install -e '.[dev,gui]'
QT_QPA_PLATFORM=offscreen python3 -m pytest -q

# Run web tests:
cd ../h3tc-web
node --version  # >=20
npm test
python3 tests/upstream_parity.py --upstream-path ../heroes3-template-util

# Real-browser E2E (requires downloading Playwright browser):
python3 -m pip install playwright==1.57.0 pillow
python3 -m playwright install chromium
python3 tests/browser_smoke.py
python3 tests/browser_responsive.py
python3 tests/browser_interactions.py
python3 tests/browser_v14.py
python3 tests/catalog_browser.py
python3 tests/i18n_audit.py
```

Из исходных тестовых данных обязательно оставьте случаи:
- **XXL Tesseract / SoD**: 1 карта, 16 зон, 32 связи, SoD→HotA 1.7/1.8.
- **Duel / HotA 1.7**: 30 карт, 270 зон, 420 строк связей. В исходном файле есть обрезанные строки связей — **не исправляйте их незаметно**.
- **Jebus Outcast / HotA 1.7**: 126 карт, 962 зоны, 2216 связей; HotA 1.7→SoD/1.8.
- **HotA 1.8/Bulwark**: создайте/включите отдельный шаблон HotA 1.8 и проверьте сохранение и понижение версии с предупреждением о потере данных.

Сравните также экспорт→повторный импорт изменённого файла, экспорт/импорт sidecar нескольких карт, точность координат `image_settings`, графический drag/drop в Chromium, сохранение PNG, Undo/Redo, dark/light, install/manifest и offline reload. `npm test` выполняется локально; обязательный браузерный тест выполняется workflow GitHub Actions в настоящем Chromium.

## 6. Увеличить версию и проверить PWA

При обновлении `Templates.zip` выполните сравнение исходных SHA-256 файлов с `templates/catalog.json`, обновите `tests/catalog_expectations.json`, прогоните тест всех карт, проверьте что после публикации PWA предзагрузила **каждый** файл. Не заменяйте пользовательские шаблоны автоматически обновлениями upstream.

Используйте **отдельную семантическую версию веб-приложения**, не копируйте номер upstream автоматически. Правила: patch — исправления; minor — новые совместимые поля / возможности; major — несовместимое изменение в веб-API или удаление формата.

```bash
python3 scripts/bump_version.py 1.4.2
```

Этот скрипт синхронно изменяет `package.json`, `manifest.webmanifest`, версию cache в `sw.js` и строку версии в `index.html`. После добавления новых файлов в `src/` проверьте **`ASSETS` в `sw.js`**, чтобы весь офлайн-интерфейс предзагружался. Убедитесь, что относительные URL (`./`) совместимы с `/repository/` GitHub Pages. По возможности испытайте обновление *ранее установленной* PWA: после новой публикации перезагрузите приложение онлайн и затем откройте без сети.

## 7. Слияние, CI и выпуск

1. Запишите новый SHA upstream вместо старого в первом разделе этого файла; обновите README, если изменились поддерживаемые версии форматов и ограничения.
2. `git status` — только ожидаемые исходники, схемы, тестовые фикстуры, документация; **никаких** файлов из `node_modules/`, `.venv/`, `dist/`, приватных шаблонов.
3. Создайте PR `sync/upstream-YYYYMMDD → main`. Проверьте `unit` и `browser` GitHub Actions; `deploy` должен запускаться лишь после успеха обоих тестов и слияния в `main`.
4. После публикации проверьте URL GitHub Pages (обычная и установленная PWA), `Network`/`Console`, импорт всех форматов, открытие offline. Если сломан импорт — откатите commit/релиз и увеличьте версию кэша при исправлении.

**Нельзя заявлять о полной совместимости с новым upstream до фактического переноса и прохождения дифференциальных тестов.** Изменение схемы, не поддержанное вручную в JS, требует отдельной реализации; автоматического механизма переноса Python-кода в браузер нет.

## Сохранение исходных байтов при обновлениях каталога (Git/CI)

Все файлы `templates/*.txt` и `tests/fixtures/*` содержат оригинальные байты, включая CRLF и иногда смешанные переводы строк. Файл `.gitattributes` **обязателен** при `git add`: он запрещает автоматическую конвертацию переводов строк для этих файлов. При обновлении `Templates.zip` сначала сохраните `.gitattributes`, затем копируйте оригинальные байты в `templates/` и пересчитывайте контрольные суммы только по оригинальным файлам. После добавления данных выполните `npm test` и проверку Git checkout из нового коммита. Не исправляйте падение CI заменой ожидаемых SHA-256 на хеши испорченных после нормализации файлов. See README for clean-checkout guidance; the release ZIP includes local-only `PROJECT_TESTS.md`.

## 1.5.0: Проверка графических алгоритмов после синхронизации

Если upstream меняет модель связей, в особенности параллельные строки между двумя зонами, заново проверьте `src/geometry.js` и `src/layout-motifs.js`. Они не должны сливать одинаковые пары зон: каждой исходной строке соответствуют отдельный SVG-путь и собственный индекс редактирования. Проверки: `npm test`, `python3 tests/browser_v150.py`, `python3 tests/catalog_browser.py`. Для повторения эталонного сравнения используйте сохранённые пользователем схемы только как визуальные образцы — они не являются обязательными файловыми зависимостями сайта.

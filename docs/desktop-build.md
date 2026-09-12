# Настольная версия

Electron открывает ту же автономную игру, что и `outputs/portable/Wellcum-back.html`.
В приложении нет локального HTTP-сервера, Node.js в renderer, preload или IPC.
Все игровые изображения, стили и код входят в сборку. Установка Node.js нужна
только разработчику для сборки, игроку она не нужна.

## Установка и сборка

Точные версии: Electron **44.3.0**, electron-builder **26.16.1**. Для сборки нужен
Node.js >= 22.13.0; эти версии закреплены в `package.json` и `package-lock.json`.

На чистом checkout:

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run desktop:mac
```

Каждая команда `desktop:*` сначала заново запускает `scripts/build-portable.mjs`,
проверяет версию, размер и SHA-256 HTML из его `build.json`, затем создаёт
`outputs/desktop-app`. Поэтому версия старой web-сборки не может незаметно попасть
в новый desktop-релиз. Подготовленный renderer получает CSP с хешем единственного
скрипта. Повреждённый пакет отказывается открываться.

| Команда | Результат |
| --- | --- |
| `npm run desktop:prepare` | Подготовленный минимальный Electron app без упаковки |
| `npm run desktop:run` | Пересборка и запуск локального Electron для ручной проверки |
| `npm run desktop:dir` | Распакованное приложение текущей архитектуры во временном каталоге; точный путь выводит команда |
| `npm run desktop:mac:arm64` | macOS Apple Silicon: ZIP и DMG |
| `npm run desktop:mac` | macOS Apple Silicon и Intel: отдельные ZIP и DMG |
| `npm run desktop:win` | Windows x64: portable EXE и NSIS setup EXE |
| `npm run desktop:win:zip` | Windows x64: ZIP с EXE и его библиотеками |

Нативная автоматическая проверка:

```sh
node scripts/smoke-desktop.mjs
# Если renderer уже подготовлен последней сборкой:
node scripts/smoke-desktop.mjs --prepared
```

Проверка запускает настоящий production main в Electron два раза с отдельным
временным профилем. Она проверяет WebGL, secure origin, sandbox/contextIsolation,
отсутствие Node в renderer, Gamepad API, открытие/закрытие настроек, настоящий
полный экран, отсутствие console errors и localStorage после холодного старта.
Профиль удаляется после проверки; пользовательские сохранения не затрагиваются.
`desktop/smoke.cjs` не включается в распространяемое приложение. Это проверка
текущей платформы: наличие Gamepad API не заменяет тест физического контроллера.

Готовые архивы находятся в `outputs/desktop`. Упаковка и подпись выполняются
во временном каталоге ОС, чтобы FileProvider/iCloud в Documents не добавлял
запрещённый для codesign FinderInfo. В проект копируются только готовые архивы
и записи их контрольных сумм `.build.json`. Не публиковать только EXE из
`win-unpacked`: ему нужны соседние DLL и `resources`. Portable EXE — отдельный
самораспаковывающийся файл; он не является ZIP с единственным HTML.

Builder запускается с `--projectDir outputs/desktop-app`, где нет production
Node-зависимостей. Это не позволяет сборщику случайно упаковать web-server или
зависимости разработки из корня. ASAR содержит только `main.cjs`, `security.cjs`,
`package.json`, `renderer/index.html` и `renderer/build.json`.

## Платформы и подпись

macOS-пакеты собирать на macOS. `arm64` — Apple Silicon, `x64` — Intel. Не нужно
собирать universal, чтобы предложить обе архитектуры. Сборка использует локальную
ad-hoc подпись (`identity: "-"`, `hardenedRuntime: false`) без сертификатов и не
проходит notarization. Это сборка для тестирования: запуск скачанного приложения
на другом Mac нельзя обещать без проверки. Для обычной публичной дистрибуции с
Developer ID нужны собственные signing credentials и отдельная настройка
notarization; конфигурация этого не имитирует. [Подпись macOS](https://www.electron.build/v26/docs/mac/).

Windows EXE тоже не подписаны. Установщик работает для текущего пользователя и
сохраняет игровые данные при удалении приложения. SmartScreen может показывать
предупреждение о неизвестном издателе. Код ресурсов EXE (версия/имя) сохраняется;
`signExecutable: false` отключает только подпись. [Windows-конфигурация](https://www.electron.build/v26/docs/win/).

Сначала предпочтительна сборка `desktop:win` на Windows x64. Cross-build на macOS
зависит от доступных нативных упаковщиков/Wine и может завершиться ошибкой до
получения NSIS или portable EXE. `desktop:win:zip` — отдельный вариант без NSIS.
Наличие Windows-архива на Mac не подтверждает его запуск на Windows: проверить
на настоящей Windows-машине перед маркировкой как проверенного релиза.
[Поддержка нескольких платформ](https://www.electron.build/multi-platform-build).

Все команды выполняют `--publish never`; загрузку архивов и source ZIP в GitHub
Release выполняют отдельно. Общие исходники включают `desktop/`, `scripts/`,
`package.json` и lockfile. `scripts/package-release.py` по-прежнему создаёт
portable/source ZIP из чистого commit. Флаг `--desktop` добавляет шесть платформенных
пакетов, проверяет их хеши, версию, runtime и исходный HTML по записям `.build.json`,
записанным упаковщиком, затем включает их в общий `SHA256SUMS.txt`. Бинарная воспроизводимость ZIP/DMG не обещается: timestamps,
подписи и platform tooling различаются; процесс и версии зависимостей закреплены.

## Хранение, управление и границы renderer

Постоянный внутренний адрес — `wellcum://game/index.html`, профиль —
`WellcumBack` внутри стандартного Electron `appData`, partition —
`persist:wellcum-game-v1`. Путь не зависит от версии и расположения приложения.
Настройки клавиш и локальные результаты сохраняются при обновлении приложения.
Браузерный профиль и desktop-профиль независимы; браузерные результаты автоматически
не импортируются. Для стандартного custom protocol Electron поддерживает
`localStorage` и IndexedDB. [Protocol API](https://www.electronjs.org/docs/latest/api/protocol).

В нативной проверке дополнительно проходят реальные события клавиатуры (включая
пробел у входа в историю) и имитация двух стандартных контроллеров разных марок:
подписи, пауза, отключение и переход управления. Эти данные не заменяют физические
DualSense/Xbox. Настоящие пользовательские сохранения smoke не открывает.

Игра использует существующие Keyboard/Gamepad API Chromium. Оболочка не добавляет
отдельные драйверы, WebHID или выдуманные раскладки non-standard устройств. После
подключения геймпада нажать на нём кнопку и отпустить. Игроки назначаются автоматически; текущие
назначения видны в игровых настройках.
Аппаратную совместимость конкретного контроллера проверять физически. Полный экран
управляется игровой кнопкой и `F`; звук может стартовать с геймпада благодаря
`autoplayPolicy: no-user-gesture-required`.
[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window).

`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` и `webSecurity`
остаются включёнными. Протокол отдаёт один фиксированный файл и не превращает URL
в произвольный путь на диске. Запрещены внешняя навигация, новые окна, webview,
загрузки, сетевые запросы и дополнительные разрешения. Разрешён только fullscreen
главного доверенного renderer. Игра автономная: онлайн-комнаты 0.7 в Electron
не поддерживаются. Для них участники открывают одну веб-версию по HTTP(S) с
сервером `/api/rooms`; код комнаты не переносит сервер в desktop-сборку. [Рекомендации Electron](https://www.electronjs.org/docs/latest/tutorial/security).

Перед релизом вручную проверить: запуск из скачанного архива, все три истории,
звук, `F`/Esc, назначение геймпада и отключение без залипания, переназначение клавиш,
закрытие и повторный запуск с сохранённым результатом. На каждой заявленной ОС
проверять отдельно. Без собственных `.icns`/`.ico` сборщик использует стандартную
иконку Electron; это видно в его логе.

Версии проверены 2026-09-12 по [Electron Releases](https://releases.electronjs.org/)
и [релизу electron-builder 26.16.1](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder%4026.16.1).

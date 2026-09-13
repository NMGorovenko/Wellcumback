# Nordschleife: исходные данные

Снимок OSM 13 сентября 2026; 52 связанных участка, замкнутый круг T13 без GP
и питлейна. © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright).
Этот производный набор геоданных распространяется на условиях ODbL.

Высоты: официальный DGM1 Rheinland-Pfalz, 1 м, GeoTIFF 2025. Атрибуция:
©GeoBasis-DE / LVermGeoRP 2026, dl-de/by-2-0, www.lvermgeo.rlp.de [Daten bearbeitet].
[Лицензия](https://www.govdata.de/dl-de/by-2-0).

`nordschleife-metric.json` содержит полные источники, URL, SHA256 тайлов,
проекцию и журнал поправок мостов. Исходная длина 3D — 20 821,420 м;
официальная длина круга — 20 832 м. Это картографическая ось, не лазерный скан.
`nordschleife-elevation-raw.json` сохраняет сырые высоты до исправления мостов.
Сборщик читает закреплённый snapshot OSM и manifest DGM, проверяет хеши,
скачивает недостающие тайлы. Python 3 + Pillow; запуск с --data-dir этой папки.

Игровая геометрия уменьшена до 18%, затем локально сглажена и разведена под
дорогу шириной 14 м. Длина 3D — 3718,746 м; перепад высот — 52,601 м.
Кольцо сохраняет исходные порядок секций и контур; это аркадная адаптация.
Ограждения находятся в 8,2 м от оси, внешние откосы — в 9,7 м.
Цельный heightfield ограничен снизу дорожным коридором, поэтому земля
не перекрывает соседнюю низкую ветвь трассы.

`build_arcade_nordschleife.py` читает только исходную геодату, а не старый
игровой результат. Зависимости для однократной генерации закреплены в
`arcade-requirements.txt`; браузеру Python не нужен. Запуск из корня проекта:

```sh
python3 assets/source/tracks/nordschleife/build_arcade_nordschleife.py \
  --source lib/game/race/nordschleife-data.ts \
  --output lib/game/race/nordschleife-arcade.ts \
  --json assets/source/tracks/nordschleife/nordschleife-arcade-metric.json
node scripts/race-visual-geometry-audit.mjs --step 2
```

Генератор проверяет радиусы, расстояние между ветвями и ориентацию треугольников.
JSON сохраняет параметры, версии библиотек и SHA исходных данных. Полученные
координаты уже в игровых метрах; повторно масштабировать их нельзя.
Покрытие, окружение, уклоны и банковка — художественное приближение.

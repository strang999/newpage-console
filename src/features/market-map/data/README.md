# Map geometry

`countries-110m.json` is copied unchanged from the npm package `world-atlas@2.0.2` (`countries-110m.json`), which redistributes Natural Earth 1:110m admin-0 country boundaries as TopoJSON. Natural Earth is in the public domain (https://www.naturalearthdata.com/about/terms-of-use/). Country ids are ISO 3166-1 numeric codes; the dataset's `iso3` codes are mapped to them in `src/domains/market/geo.ts` and verified against this file in `map-scale.test.ts`.

It is imported by the lazily loaded map chunk (about 105 KB before compression), so the map has no runtime network dependency and cannot fail to fetch its own geometry.

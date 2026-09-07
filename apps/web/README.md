# OpenHaus web client

The React and TypeScript client serves the public property explorer, property
and tour pages, information pages, the development buyer account, and the
authenticated manager workspace. Route-level bundles keep manager, account,
map, and immersive-media code out of routes that do not need them.

## Develop locally

Start the API as described in the [repository README](../../README.md), then:

```sh
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8080` by default. Point it at another
local API without changing source code:

```sh
OPENHAUS_API_PROXY_TARGET=http://127.0.0.1:8083 npm run dev -- --port 5177
```

Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_MAPS_API_KEY` for the
map. The key is browser-visible and must be restricted to the Maps JavaScript
API and approved HTTP referrers. If the provider is missing or fails, the
location list and property results remain usable and the map reports that it is
unavailable.

## Validate changes

```sh
npm test -- --run
npm run lint
npm run build
```

See the repository [interaction plan](../../docs/INTERACTION_MOTION_PLAN.md),
[map plan](../../docs/MAP_IMPLEMENTATION_PLAN.md), and
[client-account guide](../../docs/CLIENT_ACCOUNTS.md) for behavior and release
constraints.

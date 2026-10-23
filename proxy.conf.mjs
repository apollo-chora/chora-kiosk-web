// The dev server's proxy (ng serve only; the production bundle calls its own origin, and
// T1's static server proxies /api/ and /bff/ to the edge gateway, ADR-260 D2).
//
// KIOSK_WEB_API_TARGET picks the backend and has no default, so a dev session always says
// which one it is talking to:
//   the dev fixture server:  KIOSK_WEB_API_TARGET=http://127.0.0.1:18301  (npm run start:fixtures)
//   this root's kiosk edge:   KIOSK_WEB_API_TARGET=http://127.0.0.1:8094  (npm run start:stack)
const target = process.env.KIOSK_WEB_API_TARGET;
if (!target) {
  throw new Error('[kiosk-web] KIOSK_WEB_API_TARGET is not set; use npm run start:fixtures or npm run start:stack');
}
const url = new URL(target);
if (url.hostname !== '127.0.0.1') {
  throw new Error(`[kiosk-web] KIOSK_WEB_API_TARGET must be on 127.0.0.1, got ${url.hostname}`);
}
console.warn(`[kiosk-web] dev proxy: /api, /bff and the fixture pictures -> ${target}`);

// /KIOSK_DEV_FIXTURE/pictures/ is where the fixture server serves the pictures its records name
// (dev/world/make-fixtures.mjs); on the stack it answers 404, and the stack's pictures come from
// whatever URL the product records carry.
export default [
  {
    context: ['/api', '/bff', '/KIOSK_DEV_FIXTURE'],
    target,
    secure: false,
    changeOrigin: false,
  },
];

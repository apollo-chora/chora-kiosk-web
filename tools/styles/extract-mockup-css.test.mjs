import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractCss } from './extract-mockup-css.mjs';

const HTML = `<!doctype html><html><head><style>
/* ===== Tokens ===== */
:root{
  --nus-blue:#003D7C;
  --font:"Inter",sans-serif;
}
*{box-sizing:border-box}
.btn{display:inline-flex}
/* ===== Review drawer (mockup tool, outside the kiosk stage) ===== */
#review-btn{position:fixed}
#review{position:fixed;top:0}
#review.open{transform:none}
.glass{background:var(--glass)}
#review-btn[hidden]{display:none}
</style></head><body><style>.x{}</style></body></html>`;

test('keeps every kiosk rule in order, drops the tokens block and the review drawer', () => {
  const css = extractCss(HTML);
  assert.match(css, /\*\{box-sizing:border-box\}\n\.btn\{display:inline-flex\}\n\.glass\{background:var\(--glass\)\}/);
  assert.doesNotMatch(css, /:root|--nus-blue|#review|Review drawer/);
  assert.doesNotMatch(css, /\.x\{\}/);
});

test('refuses a page with no style block, or a review rule spread over lines it cannot drop safely', () => {
  assert.throws(() => extractCss('<html></html>'), /no <style> block/);
  assert.throws(() => extractCss('<style>\n#review{\n  top:0}\n</style>'), /#review rule spans lines/);
});

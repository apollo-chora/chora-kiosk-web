import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kioskPathOf, transform } from './copies.mjs';

const LENS = 'chora-web/src/app/features/surfaces/aplus/my-knowledge/concept-lens-map/concept-lens-map.component.ts';

test('maps production paths into kiosk-web: the surfaces tree to src/app, core and shared kept', () => {
  assert.equal(kioskPathOf(LENS), 'kiosk-web/src/app/aplus/my-knowledge/concept-lens-map/concept-lens-map.component.ts');
  assert.equal(kioskPathOf('chora-web/src/app/core/services/bff-client.service.ts'), 'kiosk-web/src/app/core/services/bff-client.service.ts');
  assert.equal(kioskPathOf('chora-web/src/environments/environment.ts'), 'kiosk-web/src/environments/environment.ts');
  assert.throws(() => kioskPathOf('services/chora-consumption/x.go'), /not a chora-web source path/);
});

test('re-points a relative import that leaves the surfaces tree, and keeps one inside it', () => {
  const src = [
    "import { BffClientService } from '../../../../core/services/bff-client.service';",
    "import type { ConceptGraph } from './concept-graph.model';",
    "import type { MapCampaign } from '../my-knowledge/campaign.model';",
  ].join('\n');
  const out = transform(src, 'chora-web/src/app/features/surfaces/aplus/discovery-graph/concept-graph.service.ts');
  assert.equal(
    out,
    [
      "import { BffClientService } from '../../core/services/bff-client.service';",
      "import type { ConceptGraph } from './concept-graph.model';",
      "import type { MapCampaign } from '../my-knowledge/campaign.model';",
    ].join('\n'),
  );
});

test('swaps production’s translate pipe and service for @ngx-translate/core (same instant() and pipe)', () => {
  const src = [
    "import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';",
    "import { TranslateService } from '../../../../../core/services/translate.service';",
  ].join('\n');
  assert.equal(
    transform(src, LENS),
    ["import { TranslatePipe } from '@ngx-translate/core';", "import { TranslateService } from '@ngx-translate/core';"].join('\n'),
  );
});

test('turns em and en dashes into colons, commas and hyphens (owner style rule)', () => {
  assert.equal(transform('// the focus — the lens centres on it', LENS), '// the focus: the lens centres on it');
  assert.equal(transform('/** ends —\n * next */', LENS), '/** ends:\n * next */');
  assert.equal(transform('// a—b, 2–3 times', LENS), '// a, b, 2-3 times');
});

test('leaves package imports, ellipses and box-drawing characters alone', () => {
  const src = "import { signal } from '@angular/core';\n// ── GET …/questions ──";
  assert.equal(transform(src, LENS), src);
});

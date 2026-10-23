import { Injectable, InjectionToken, Pipe, PipeTransform, inject } from '@angular/core';

/** K149's random draw: Math.random in the product; a seeded source in tests only (visit-order.testing.ts). */
export const VISIT_RANDOM = new InjectionToken<() => number>('VISIT_RANDOM', { providedIn: 'root', factory: () => Math.random });

/**
 * K149: the options of each served practice question (story step 3, the atlas, the Companions
 * quiz, LIVE question sets) and each dose quick check, in an order drawn once per question per
 * demo session. The serve door orders a question's options by a hash of their text (F40), fair
 * over many questions but the same for every visitor, so step 3's prepared answer sat at D for
 * all of them. A question is its set of option ids, so a re-render, a re-read or Back shows the
 * order already drawn; the end of the session forgets every order. Only the order on screen
 * changes: answers still go by option id. Step 4's draft (its critic names option D) and the
 * dashboard's assessments (delivery's own shuffle, K145) never come through here.
 */
@Injectable({ providedIn: 'root' })
export class VisitOrder {
  private readonly random = inject(VISIT_RANDOM);
  /** Each question's option ids in the order shown this session, by the question's sorted ids. */
  private readonly orders = new Map<string, readonly string[]>();
  /** The array shown for each served array, so a template binds the same array while the session lasts. */
  private shown = new WeakMap<readonly unknown[], readonly unknown[]>();

  options<T>(options: readonly T[], id: (o: T) => string): readonly T[] {
    const cached = this.shown.get(options) as readonly T[] | undefined;
    if (cached) return cached;
    const byId = new Map<string, T>();
    for (const o of options) {
      const k = id(o);
      if (byId.has(k)) throw new Error(`[kiosk] a question carries option id ${k} twice, so its options cannot be ordered`);
      byId.set(k, o);
    }
    const key = [...byId.keys()].sort().join('\n');
    let order = this.orders.get(key);
    if (!order) {
      order = this.draw([...byId.keys()]);
      this.orders.set(key, order);
    }
    const out = order.map((k) => byId.get(k) as T);
    this.shown.set(options, out);
    return out;
  }

  /** The demo session ends: the next visitor gets fresh orders. */
  forget(): void {
    this.orders.clear();
    this.shown = new WeakMap();
  }

  /** Fisher-Yates over the served order. */
  private draw(ids: string[]): readonly string[] {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }
}

/**
 * `@for (o of question.options | visitOrder; ...)`: a practice question's or a dose check's
 * options in this session's order. Impure, so a session's end reaches an array a scene kept; the
 * service hands back the same array while the session lasts.
 */
@Pipe({ name: 'visitOrder', pure: false })
export class VisitOrderPipe implements PipeTransform {
  private readonly order = inject(VisitOrder);

  transform<T extends { readonly optionId: string } | { readonly option_id: string }>(options: readonly T[]): readonly T[] {
    return this.order.options(options, (o) => ('optionId' in o ? o.optionId : o.option_id));
  }
}

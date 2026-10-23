import { Directive } from '@angular/core';

/**
 * Marks an element whose text is content Chora generated (a question, a concept name, a
 * critic note, a greeting): English in every language (K41, ADR-259 D9 rule 10), so it is
 * never passed through the translate pipe, and `lang="en"` tells the browser and screen
 * readers so even inside the Chinese interface.
 */
@Directive({
  selector: '[kioskContent]',
  host: { lang: 'en' },
})
export class ContentDirective {}

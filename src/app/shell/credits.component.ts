import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The credits page in the original NUS-ISS design (K16 as amended, K22). Names, official titles and the
 * contact email stay in English in both languages; only the labels translate (K17). The award is left
 * out (D4 superseded). K201 (amends K183, K184's layout and K185): the programme line; two columns
 * about a hairline rule, the team on the left ("Project team members" over the three names stacked,
 * K185's order) and the Programme Chief over the Academic Supervisor on the right, each its label, name
 * and official NUS-ISS title (K184); then "Contact for this project" over the owner's email; then how to
 * close. No asterisk and no footnote. One type system: every label .c-lbl, every name in a name slot.
 */
@Component({
  selector: 'kiosk-credits',
  imports: [TranslatePipe],
  template: `
    <div class="c-line c-org">{{ 'credits.org' | translate }}</div>
    <div class="c-line c-cols">
      <div class="c-col team">
        <div class="c-lbl">{{ 'credits.kicker' | translate }}</div>
        <div class="c-names">
          <div>Dale Leung</div>
          <div>Walfarid Hermawan Limbong</div>
          <div>Htet Aung</div>
        </div>
      </div>
      <div class="c-col fac">
        <div class="c-fac">
          <div class="c-lbl">{{ 'credits.chief' | translate }}</div>
          <div class="c-person">Heng Boon Kui</div>
          <div class="c-title">Chief, MTech Software Engineering Programme</div>
        </div>
        <div class="c-fac">
          <div class="c-lbl">{{ 'credits.supervisor' | translate }}</div>
          <div class="c-person">Darryl Ng</div>
          <div class="c-title">Senior Lecturer &amp; Consultant, Software Systems Practice</div>
        </div>
      </div>
    </div>
    <div class="c-line c-contact">
      <div class="c-lbl">{{ 'credits.contact' | translate }}</div>
      <div class="c-mail">daleleung76&#64;gmail.com</div>
    </div>
    <div class="c-line c-close">{{ 'credits.close' | translate }}</div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditsComponent {}

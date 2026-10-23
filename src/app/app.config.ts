import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';

import { provideKioskI18n } from './i18n/i18n';
import { authInterceptor } from './kiosk-api/session.service';
import { modelCallGuard } from './live/live-http';
import { provideLive } from './live/live.providers';

// No service worker: ngsw answers every request and turns a failed fetch into a synthetic 504.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // The guard first: a refused model call never mints a session.
    provideHttpClient(withInterceptors([modelCallGuard, authInterceptor])),
    ...provideKioskI18n(),
    ...provideLive(),
  ],
};

import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Scroll to the top on every new page and restore the position on Back.
    // Blocking initial navigation: the first paint already shows the page the
    // address asks for (and guards have redirected), with no flash of Home.
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      withEnabledBlockingInitialNavigation()
    ),
    provideHttpClient(),
  ],
};

export const environment = {
  production: false,
  // Development backend. Used by `ng serve`, `ng test`, and development builds.
  apiBaseUrl: 'http://localhost:5175',
  // Public WhatsApp business number for Click-to-WhatsApp, digits only with
  // country code (e.g. '919876543210'; no +, spaces or hyphens). No verified
  // company number exists in the project yet, so this is intentionally empty:
  // the "Continue on WhatsApp" action stays hidden until it is configured.
  whatsappBusinessNumber: '',
};

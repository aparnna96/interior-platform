export const environment = {
  production: true,
  // Production backend placeholder. The backend is deployed separately and
  // no production API domain exists yet — replace this value when it does.
  // Example: 'https://api.example.com'. No trailing slash.
  apiBaseUrl: 'https://YOUR-PRODUCTION-API-DOMAIN',
  // Public WhatsApp business number, digits only with country code
  // (e.g. '919876543210'). Intentionally empty until the real company number
  // is supplied; the WhatsApp action stays hidden while it is empty.
  whatsappBusinessNumber: '',
};

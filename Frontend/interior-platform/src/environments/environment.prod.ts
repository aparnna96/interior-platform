export const environment = {
  production: true,
  // Production backend: ASP.NET Core API on Railway (Singapore). No trailing
  // slash. Must match the Railway service's public domain.
  apiBaseUrl: 'https://interior-platform-production.up.railway.app',
  // Public WhatsApp business number, digits only with country code
  // (e.g. '919876543210'). Intentionally empty until the real company number
  // is supplied; the WhatsApp action stays hidden while it is empty.
  whatsappBusinessNumber: '',
};

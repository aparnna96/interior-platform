export const environment = {
  production: true,
  // Production backend: ASP.NET Core API on Railway (Singapore). No trailing
  // slash. Must match the Railway service's public domain.
  apiBaseUrl: 'https://interior-platform-production.up.railway.app',
  // Public WhatsApp business number, digits only with country code. Taken
  // from the company website's own WhatsApp link (wa.me/918139860663). The
  // "Continue on WhatsApp" action stays hidden if this is ever emptied.
  whatsappBusinessNumber: '918139860663',
};

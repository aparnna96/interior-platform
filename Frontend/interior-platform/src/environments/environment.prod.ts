export const environment = {
  production: true,
  // Production backend: ASP.NET Core API on Railway (Singapore). No trailing
  // slash. Must match the Railway service's public domain.
  apiBaseUrl: 'https://interior-platform-production.up.railway.app',
  // Public WhatsApp business number, digits only with country code. Taken
  // from the company website's own WhatsApp link (wa.me/918139860663). The
  // "Continue on WhatsApp" action stays hidden if this is ever emptied.
  whatsappBusinessNumber: '918139860663',
  // Master switch for the WhatsApp action. OFF until the client officially confirms
  // their WhatsApp number: leads are still saved, but nothing is sent to an
  // unverified number. The number above is kept as-is and is NOT used while this is false.
  whatsappEnabled: false,
};

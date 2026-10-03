/** Pre-formatted field SMS launchers. sms: URIs can't send automatically --
 *  there is no way to fire a text without the user's own device and app, so
 *  this only ever pre-fills the native composer; the tech still taps send.
 *  The ?body= param form works on both iOS and Android today. */

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

function smsLink(phone, body) {
  return `sms:${phone}?body=${encodeURIComponent(body)}`;
}

export function onMyWayLink(phone, customerName, address, minutes = 15) {
  const body = `Hi ${firstName(customerName)}, this is Nova Shield. We are on our way to ` +
    `${address || 'your property'} and plan to arrive in approximately ${minutes} minutes!`;
  return smsLink(phone, body);
}

/** reviewUrl comes from app_settings.company.google_review_url -- there is
 *  no real link to put here until the business adds one (Settings -> this
 *  key), so the message degrades to a plain thank-you + feedback ask
 *  rather than ever shipping a fabricated or placeholder URL. */
export function reviewRequestLink(phone, customerName, reviewUrl) {
  const body = reviewUrl
    ? `Hi ${firstName(customerName)}, thank you for choosing Nova Shield! How did everything look ` +
      `today? If you're happy with the work, we'd greatly appreciate a quick review: ${reviewUrl}`
    : `Hi ${firstName(customerName)}, thank you for choosing Nova Shield! How did everything look ` +
      `today? We'd love to hear your feedback.`;
  return smsLink(phone, body);
}

'use strict';

const { getCurrentOnCallEvents } = require('./calendar');

/**
 * Resolves the currently on-call contact by:
 *  1. Fetching the calendar events active right now.
 *  2. Using the event subject as the person's name ("First Last").
 *  3. Extracting their phone number from the event body/notes, assuming a
 *     +1 country code when none is given.
 *
 * @returns {Promise<{ name: string, phone: string }|null>}
 */
async function getOnCallContact() {
  let events;
  try {
    events = await getCurrentOnCallEvents();
  } catch (err) {
    // Treat calendar errors as "no one on call" but surface the warning.
    console.warn('[oncall] Failed to fetch calendar events:', err.message);
    return null;
  }

  for (const event of events) {
    const name = (event.subject || '').trim();
    const bodyContent = (event.body && event.body.content) || '';
    const phone = normalizePhoneNumber(bodyContent);

    if (name && phone) {
      return { name, phone };
    }
  }

  console.warn('[oncall] No calendar event with a valid name and phone number found.');
  return null;
}

/**
 * Extracts a phone number from the (possibly HTML) event body and
 * normalizes it to E.164, assuming a +1 country code when none is present.
 *
 * @param {string} rawText
 * @returns {string|null}
 */
function normalizePhoneNumber(rawText) {
  const text = rawText.replace(/<[^>]*>/g, ' ');

  const withCountryCode = text.match(/\+\d{10,15}/);
  if (withCountryCode) return withCountryCode[0];

  const digits = text.replace(/\D/g, '');

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return null;
}

module.exports = { getOnCallContact };

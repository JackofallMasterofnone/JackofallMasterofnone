'use strict';

const { getCurrentOnCallEvent } = require('./calendar');

/**
 * Resolves the currently on-call contact by:
 *  1. Fetching the current on-call calendar event.
 *  2. Stripping the configured prefix (and optional colon + whitespace) from
 *     the event subject to extract the person's name.
 *  3. Looking up the name (case-insensitive) in the ONCALL_CONTACTS JSON map.
 *
 * @returns {Promise<{ name: string, phone: string }|null>}
 */
async function getOnCallContact() {
  let event;
  try {
    event = await getCurrentOnCallEvent();
  } catch (err) {
    // Treat calendar errors as "no one on call" but surface the warning.
    console.warn('[oncall] Failed to fetch calendar event:', err.message);
    return null;
  }

  if (!event) return null;

  const prefix = process.env.ONCALL_EVENT_PREFIX || 'On-call';
  const subject = event.subject || '';

  // Strip prefix + optional colon + leading/trailing whitespace to get the name.
  // e.g. "On-call: John Smith" → "John Smith"
  //      "On-call John Smith"  → "John Smith"
  const prefixRegex = new RegExp(
    `^${escapeRegExp(prefix)}[:\\s]*`,
    'i'
  );
  const name = subject.replace(prefixRegex, '').trim();

  if (!name) {
    console.warn('[oncall] Could not extract name from subject:', subject);
    return null;
  }

  let contacts;
  try {
    contacts = JSON.parse(process.env.ONCALL_CONTACTS || '{}');
  } catch (err) {
    console.warn('[oncall] ONCALL_CONTACTS is not valid JSON:', err.message);
    return null;
  }

  // Case-insensitive lookup.
  const nameLower = name.toLowerCase();
  const matchedKey = Object.keys(contacts).find(
    (k) => k.toLowerCase() === nameLower
  );

  if (!matchedKey) {
    console.warn('[oncall] No phone number found for on-call person:', name);
    return null;
  }

  return { name: matchedKey, phone: contacts[matchedKey] };
}

/**
 * Escapes special regex characters in a string so it can be used as a literal
 * pattern inside a RegExp constructor.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { getOnCallContact };

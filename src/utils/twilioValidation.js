'use strict';

const twilio = require('twilio');

/**
 * Validates the X-Twilio-Signature header on an incoming webhook request.
 *
 * When SKIP_TWILIO_VALIDATION is set to "true" (e.g. in local development)
 * validation is bypassed and the function always returns true.
 *
 * @param {Request} request  - Web API Request object (Azure Functions v4).
 * @param {object}  params   - Parsed form-data body as a plain key/value object.
 * @returns {boolean}
 */
function validateTwilioSignature(request, params) {
  if (process.env.SKIP_TWILIO_VALIDATION === 'true') {
    return true;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    throw new Error('Missing required env var: TWILIO_AUTH_TOKEN');
  }

  const signature = request.headers.get('x-twilio-signature') || '';

  // Build the canonical URL that Twilio used to sign the request.
  // If WEBHOOK_BASE_URL is set, replace the origin of the incoming URL so that
  // requests proxied through a local tunnel or load balancer are validated
  // against the publicly visible URL Twilio actually signed.
  let webhookUrl = request.url;
  const baseUrl = process.env.WEBHOOK_BASE_URL;
  if (baseUrl) {
    try {
      const parsed = new URL(request.url);
      const base = new URL(baseUrl);
      // Replace scheme + host (origin) but keep the path and query string.
      parsed.protocol = base.protocol;
      parsed.host = base.host;
      webhookUrl = parsed.toString();
    } catch {
      // If URL parsing fails, fall back to the raw request URL.
    }
  }

  return twilio.validateRequest(authToken, signature, webhookUrl, params);
}

/**
 * Calls validateTwilioSignature and throws a 403 Response if validation fails.
 * Use this in function handlers for a clean early-exit pattern.
 *
 * @param {Request} request
 * @param {object}  params
 */
function assertTwilioSignature(request, params) {
  if (!validateTwilioSignature(request, params)) {
    throw new Response('Forbidden: invalid Twilio signature', { status: 403 });
  }
}

module.exports = { validateTwilioSignature, assertTwilioSignature };

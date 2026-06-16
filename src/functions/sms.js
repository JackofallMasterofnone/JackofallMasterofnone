'use strict';

const { app } = require('@azure/functions');
const twilio = require('twilio');
const { getOnCallContact } = require('../services/oncall');
const { assertTwilioSignature } = require('../utils/twilioValidation');

/**
 * Azure Functions v4 HTTP trigger — Twilio SMS webhook.
 *
 * Twilio calls this endpoint when an SMS arrives at the configured Twilio
 * number. We forward the message to the on-call person via the Twilio REST API
 * and send a confirmation reply back to the original sender.
 */
async function smsHandler(request, context) {
  let params = {};

  try {
    // Parse the URL-encoded form body that Twilio sends with every webhook.
    const formData = await request.formData();
    params = Object.fromEntries(formData);

    // Validate that the request genuinely came from Twilio.
    assertTwilioSignature(request, params);

    const from = params['From'] || '';
    const body = params['Body'] || '';

    const contact = await getOnCallContact();

    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();

    if (contact) {
      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const callerName = await lookupCallerName(twilioClient, from, context);

      context.log(
        `[sms] Forwarding SMS from ${callerName} (${from}) to on-call: ${contact.name} (${contact.phone})`
      );

      // Forward the message to the on-call person via the Twilio REST API.
      await twilioClient.messages.create({
        body: `${callerName} (${from}): ${body}`,
        from: process.env.TWILIO_NUMBER,
        to: contact.phone,
      });

      // Reply to the original sender.
      twiml
        .message()
        .body(
          `Your message has been forwarded to the on-call team member (${contact.name}).`
        );
    } else {
      context.log('[sms] No on-call contact found; replying to sender.');
      twiml
        .message()
        .body('No one is currently on call. Your message could not be forwarded.');
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: twiml.toString(),
    };
  } catch (err) {
    // Re-throw 403 Responses so the runtime returns them as-is.
    if (err instanceof Response) throw err;

    context.log.error('[sms] Unhandled error:', err);
    return { status: 500, body: 'Internal server error' };
  }
}

/**
 * Looks up the caller name for a phone number via the Twilio Lookup API.
 * Falls back to "Unknown Caller" if the lookup fails or returns no name
 * (common for mobile numbers, which often have no CNAM data).
 *
 * @param {import('twilio').Twilio} twilioClient
 * @param {string} phoneNumber
 * @param {import('@azure/functions').InvocationContext} context
 * @returns {Promise<string>}
 */
async function lookupCallerName(twilioClient, phoneNumber, context) {
  try {
    const lookup = await twilioClient.lookups.v2
      .phoneNumbers(phoneNumber)
      .fetch({ fields: 'caller_name' });

    return (lookup.callerName && lookup.callerName.caller_name) || 'Unknown Caller';
  } catch (err) {
    context.log.warn('[sms] Caller name lookup failed:', err.message);
    return 'Unknown Caller';
  }
}

app.http('sms', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: smsHandler,
});

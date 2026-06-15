'use strict';

const { app } = require('@azure/functions');
const twilio = require('twilio');
const { getOnCallContact } = require('../services/oncall');
const { assertTwilioSignature } = require('../utils/twilioValidation');

/**
 * Azure Functions v4 HTTP trigger — Twilio voice webhook.
 *
 * Twilio calls this endpoint when someone dials the configured Twilio number.
 * We respond with TwiML that either dials the on-call person or plays a
 * "no one on call" message and records a voicemail.
 */
async function voiceHandler(request, context) {
  let params = {};

  try {
    // Parse the URL-encoded form body that Twilio sends with every webhook.
    const formData = await request.formData();
    params = Object.fromEntries(formData);

    // Validate that the request genuinely came from Twilio.
    assertTwilioSignature(request, params);

    const contact = await getOnCallContact();

    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    if (contact) {
      context.log(`[voice] Forwarding call to on-call: ${contact.name} (${contact.phone})`);
      const dial = twiml.dial({ callerId: process.env.TWILIO_NUMBER });
      dial.number(contact.phone);
    } else {
      context.log('[voice] No on-call contact found; playing fallback message.');
      twiml.say(
        'No one is currently on call. Please try again later or leave a voicemail after the tone.'
      );
      twiml.record({ maxLength: 120 });
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: twiml.toString(),
    };
  } catch (err) {
    // Re-throw 403 Responses so the runtime returns them as-is.
    if (err instanceof Response) throw err;

    context.log.error('[voice] Unhandled error:', err);
    return { status: 500, body: 'Internal server error' };
  }
}

app.http('voice', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: voiceHandler,
});

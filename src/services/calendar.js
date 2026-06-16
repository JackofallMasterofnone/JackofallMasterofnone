'use strict';

const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const {
  TokenCredentialAuthenticationProvider,
} = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');

// Module-level singleton for the Graph client
let graphClient = null;

/**
 * Returns (and lazily initialises) the Microsoft Graph client using
 * app-only / client credentials flow.
 */
function getGraphClient() {
  if (graphClient) return graphClient;

  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;

  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error(
      'Missing required Azure AD env vars: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET'
    );
  }

  const credential = new ClientSecretCredential(
    AZURE_TENANT_ID,
    AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  graphClient = Client.initWithMiddleware({ authProvider });
  return graphClient;
}

/**
 * Queries the calendarView of the configured shared mailbox and returns all
 * events active right now (subject = on-call person's name, body = their
 * phone number).
 *
 * The time window is "now" to "now + 60 seconds" so we only surface events
 * that are active at this exact moment.
 *
 * @returns {Promise<object[]>} An array of Graph calendarEvent objects.
 */
async function getCurrentOnCallEvents() {
  const calendarUserId = process.env.CALENDAR_USER_ID;

  if (!calendarUserId) {
    throw new Error('Missing required env var: CALENDAR_USER_ID');
  }

  const now = new Date();
  const startDateTime = now.toISOString();
  const endDateTime = new Date(now.getTime() + 60_000).toISOString();

  const client = getGraphClient();

  const response = await client
    .api(`/users/${calendarUserId}/calendarView`)
    .query({
      startDateTime,
      endDateTime,
      $select: 'subject,body,start,end',
      $top: 25,
    })
    .get();

  return (response && response.value) ? response.value : [];
}

module.exports = { getCurrentOnCallEvents };

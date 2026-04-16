const axios = require('axios');
const NodeCache = require('node-cache');

const GUESTY_API_BASE = 'https://open-api.guesty.com';
const tokenCache = new NodeCache({ stdTTL: 82800 }); // 23 hours (tokens last 24h)

// ─────────────────────────────────────────────
// Get or refresh the OAuth2 access token
// ─────────────────────────────────────────────
async function getGuestyToken() {
  const cached = tokenCache.get('access_token');
  if (cached) return cached;

  const clientId = process.env.GUESTY_CLIENT_ID;
  const clientSecret = process.env.GUESTY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET. ' +
      'Set these in your .env file. Get them from Guesty Dashboard → Marketplace → Open API.'
    );
  }

  const response = await axios.post(`${GUESTY_API_BASE}/oauth2/token`, {
    grant_type: 'client_credentials',
    scope: 'open-api',
    client_id: clientId,
    client_secret: clientSecret,
  }, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const token = response.data.access_token;
  tokenCache.set('access_token', token);
  return token;
}

// ─────────────────────────────────────────────
// Search for reservations by guest last name
// Searches ALL listings in the account within a ±48 hour window
// ─────────────────────────────────────────────
async function searchReservations(token, lastName, listingIds) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48h ago
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);   // 48h from now

  // Guesty's $eq filter is case-sensitive, so we try multiple common formats
  // e.g. "smith" → try "Smith", "smith", "SMITH"
  const nameVariations = [
    lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase(), // Smith
    lastName.toLowerCase(),                                              // smith
    lastName.toUpperCase(),                                              // SMITH
    lastName,                                                            // as typed
  ];
  // Remove duplicates
  const uniqueNames = [...new Set(nameVariations)];

  // Try each name variation until we find results
  for (const nameAttempt of uniqueNames) {
    const filters = [
      { operator: '$eq', field: 'guest.lastName', value: nameAttempt },
      { operator: '$in', field: 'status', value: ['confirmed', 'checked_in'] },
    ];

    filters.push(
      { operator: '$lte', field: 'checkIn', value: windowEnd.toISOString() },
      { operator: '$gte', field: 'checkOut', value: windowStart.toISOString() }
    );

    const params = {
      filters: JSON.stringify(filters),
      fields: [
        '_id',
        'guest.firstName',
        'guest.lastName',
        'guest.fullName',
        'checkIn',
        'checkOut',
        'checkInDateLocalized',
        'checkOutDateLocalized',
        'listing.title',
        'listing._id',
        'status',
        'guestAppUrl',
      ].join(' '),
      limit: 10,
      sort: 'checkIn',
    };

    const response = await axios.get(`${GUESTY_API_BASE}/v1/reservations`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      params,
    });

    const results = response.data.results || [];
    if (results.length > 0) {
      return results;
    }
  }

  // No results found with any name variation
  return [];
}

module.exports = { getGuestyToken, searchReservations };

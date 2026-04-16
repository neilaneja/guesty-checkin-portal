require('dotenv').config();
const express = require('express');
const path = require('path');
const { getGuestyToken, searchReservations } = require('./api/guesty');
const properties = require('./config/properties.json').properties;

// Debug: log whether Guesty env vars are present at startup
console.log('ENV CHECK:', {
  GUESTY_CLIENT_ID: process.env.GUESTY_CLIENT_ID ? `SET (${process.env.GUESTY_CLIENT_ID.substring(0, 4)}...)` : 'MISSING',
  GUESTY_CLIENT_SECRET: process.env.GUESTY_CLIENT_SECRET ? `SET (${process.env.GUESTY_CLIENT_SECRET.substring(0, 4)}...)` : 'MISSING',
  NODE_ENV: process.env.NODE_ENV || 'not set',
  PORT: process.env.PORT || 'not set',
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// Property lookup middleware
// ─────────────────────────────────────────────
function findProperty(slug) {
  return properties.find(p => p.slug === slug) || null;
}

// ─────────────────────────────────────────────
// Route: Root URL redirects to the first property's check-in page
// (so visiting the bare domain doesn't show "Cannot GET /")
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  if (properties.length > 0) {
    return res.redirect(`/checkin/${properties[0].slug}`);
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ─────────────────────────────────────────────
// Route: Serve the check-in page for a property
// Supports both /checkin/:slug and /checkinform (legacy single-property)
// ─────────────────────────────────────────────
app.get('/checkin/:slug', (req, res) => {
  const property = findProperty(req.params.slug);
  if (!property) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
});

// Legacy route for single-property setups (e.g., thewestendflats.com/checkinform)
app.get('/checkinform', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
});

// ─────────────────────────────────────────────
// API: Get property config (for front-end branding)
// ─────────────────────────────────────────────
app.get('/api/property/:slug', (req, res) => {
  const property = findProperty(req.params.slug);
  if (!property) {
    return res.status(404).json({ error: 'Property not found' });
  }
  // Only send safe, public-facing data
  res.json({
    name: property.name,
    welcomeMessage: property.welcomeMessage,
    logoUrl: property.logoUrl,
    brandColor: property.brandColor,
    accentColor: property.accentColor,
    fallbackPhone: property.fallbackPhone,
  });
});

// ─────────────────────────────────────────────
// API: Search for a reservation by last name
// ─────────────────────────────────────────────
app.post('/api/lookup', async (req, res) => {
  const { lastName, propertySlug } = req.body;

  if (!lastName || !propertySlug) {
    return res.status(400).json({ error: 'Last name and property are required.' });
  }

  const property = findProperty(propertySlug);
  if (!property) {
    return res.status(404).json({ error: 'Property not found.' });
  }

  try {
    const token = await getGuestyToken();
    const results = await searchReservations(token, lastName, property.guestyListingIds);

    if (results.length === 0) {
      return res.json({
        status: 'not_found',
        message: 'No reservation found. Please check the spelling of your last name and try again.',
      });
    }

    if (results.length === 1) {
      return res.json({
        status: 'found',
        reservation: {
          id: results[0]._id,
          guestFirstName: results[0].guest?.firstName || '',
          checkIn: results[0].checkInDateLocalized || results[0].checkIn,
          checkOut: results[0].checkOutDateLocalized || results[0].checkOut,
          listingName: results[0].listing?.title || '',
          // The Guesty check-in form URL
          checkInFormUrl: buildCheckInFormUrl(results[0], property),
        },
      });
    }

    // Multiple matches — need disambiguation
    return res.json({
      status: 'multiple',
      message: 'We found multiple reservations. Please select yours.',
      reservations: results.map(r => ({
        id: r._id,
        guestFirstName: r.guest?.firstName || '',
        guestLastName: r.guest?.lastName || '',
        checkIn: r.checkInDateLocalized || r.checkIn,
        checkOut: r.checkOutDateLocalized || r.checkOut,
        listingName: r.listing?.title || '',
        checkInFormUrl: buildCheckInFormUrl(r, property),
      })),
    });
  } catch (err) {
    console.error('Reservation lookup error:', err.message);
    return res.status(500).json({
      error: 'system_error',
      message: 'Something went wrong. Please try again or call us for help.',
    });
  }
});

// ─────────────────────────────────────────────
// Build the Guesty Guest App check-in form URL
// ─────────────────────────────────────────────
// URL pattern: https://guest-app.guesty.com/r/{reservationId}/{base64Token}
// The base64 token encodes the guest app name: {{guest_app::west_end_flats}}
function buildCheckInFormUrl(reservation, property) {
  // If the reservation object contains a direct guestAppUrl, use that
  if (reservation.guestAppUrl) {
    return reservation.guestAppUrl;
  }

  // Build the URL using the guest app name from the property config
  const guestAppName = property.guestyGuestAppName || 'default';
  const tokenPayload = `{{guest_app::${guestAppName}}}`;
  const base64Token = Buffer.from(tokenPayload).toString('base64');
  return `https://guest-app.guesty.com/r/${reservation._id}/${base64Token}`;
}

// ─────────────────────────────────────────────
// API: Check Guesty rate limit status
// Visit /api/rate-limit-status to see remaining quota
// ─────────────────────────────────────────────
app.get('/api/rate-limit-status', async (req, res) => {
  try {
    const token = await getGuestyToken();
    // Make a lightweight API call to check rate limit headers
    const response = await require('axios').get(`${require('./api/guesty').GUESTY_API_BASE || 'https://open-api.guesty.com'}/v1/reservations`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      params: { limit: 1, fields: '_id' },
    });
    const headers = response.headers;
    res.json({
      status: 'ok',
      rateLimits: {
        perSecond: { limit: headers['x-ratelimit-limit-second'], remaining: headers['x-ratelimit-remaining-second'] },
        perMinute: { limit: headers['x-ratelimit-limit-minute'], remaining: headers['x-ratelimit-remaining-minute'] },
        perHour: { limit: headers['x-ratelimit-limit-hour'], remaining: headers['x-ratelimit-remaining-hour'] },
      },
    });
  } catch (err) {
    const status = err.response?.status || 'unknown';
    const retryAfter = err.response?.headers?.['retry-after'] || 'not provided';
    res.json({
      status: 'rate_limited',
      httpStatus: status,
      retryAfterSeconds: retryAfter,
      message: status === 429 ? `Still rate limited. Retry after ${retryAfter} seconds.` : err.message,
    });
  }
});

// ─────────────────────────────────────────────
// Serve signage template
// ─────────────────────────────────────────────
app.get('/signage/:slug', (req, res) => {
  const property = findProperty(req.params.slug);
  if (!property) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'signage.html'));
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Check-in portal running on port ${PORT}`);
  console.log(`Properties loaded: ${properties.map(p => p.slug).join(', ')}`);
});

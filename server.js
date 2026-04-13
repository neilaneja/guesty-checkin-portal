require('dotenv').config();
const express = require('express');
const path = require('path');
const { getGuestyToken, searchReservations } = require('./api/guesty');
const properties = require('./config/properties.json').properties;

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
          checkInFormUrl: buildCheckInFormUrl(results[0]),
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
        checkInFormUrl: buildCheckInFormUrl(r),
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
// Guesty's check-in form URL pattern. This uses the standard Guest App URL.
// If your account uses a custom domain for the guest app, update this.
function buildCheckInFormUrl(reservation) {
  // Option 1: If the reservation object contains a direct guestAppUrl or
  // checkInFormUrl field from Guesty, use that directly.
  if (reservation.guestAppUrl) {
    return reservation.guestAppUrl;
  }

  // Option 2: Construct the standard Guesty Guest App check-in URL.
  // The format is: https://app.guestybooking.com/guest-app/{reservationId}
  // NOTE: Verify this URL pattern in your Guesty dashboard under
  // Operations → Guest App. The exact format may vary by account.
  // You may also use the Guest App API to retrieve the URL dynamically:
  //   GET /v1/guest-app-api/guest-app-runtime/{reservationId}/module/check_in/summary
  return `https://app.guestybooking.com/guest-app/${reservation._id}`;
}

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

# Guesty Self Check-In Portal — Deployment Guide

## What This Is

A self-serve check-in portal for vacation rental guests. When Expedia (or any OTA) doesn't pass guest contact info to Guesty, guests scan a QR code at the door, enter their last name, and get redirected to their Guesty check-in form.

---

## Step 1: Get Your Guesty API Credentials

1. Log into your **Guesty Dashboard**
2. Go to **Marketplace → Open API**
3. Create a new integration (or use an existing one)
4. Copy your **Client ID** and **Client Secret**
5. Note your **Listing IDs** — find these under Listings → click a listing → the ID is in the URL

---

## Step 2: Configure Your Properties

Open `config/properties.json` and edit it for your properties:

```json
{
  "properties": [
    {
      "slug": "west-end-flats",          // URL-safe name (used in the URL)
      "name": "The West End Flats",       // Display name
      "welcomeMessage": "Welcome to The West End Flats!",
      "logoUrl": "/logos/west-end-flats.png",  // Put logo in public/logos/
      "brandColor": "#2C3E50",            // Header/brand color
      "accentColor": "#E67E22",           // Button color
      "fallbackPhone": "(555) 123-4567",  // Emergency contact
      "guestyListingIds": ["abc123"]      // Guesty listing ID(s) for this property
    }
  ]
}
```

For each property, add its logo image to the `public/logos/` folder.

---

## Step 3: Deploy (Pick One)

### Option A: Railway (Recommended — Easiest)

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project" → "Deploy from GitHub repo"**
3. Connect your repo (push this code to GitHub first)
4. Railway auto-detects Node.js. Add these **environment variables**:
   - `GUESTY_CLIENT_ID` = your client ID
   - `GUESTY_CLIENT_SECRET` = your client secret
5. Click **Deploy** — Railway gives you a URL like `your-app.up.railway.app`
6. (Optional) Add a custom domain like `thewestendflats.com`

### Option B: Render

1. Go to [render.com](https://render.com) and connect your GitHub repo
2. Create a **Web Service**, select your repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add the environment variables (same as above)
6. Deploy — Render gives you a `.onrender.com` URL

### Option C: Fly.io

```bash
# Install flyctl, then:
fly launch
fly secrets set GUESTY_CLIENT_ID=your_id GUESTY_CLIENT_SECRET=your_secret
fly deploy
```

---

## Step 4: Set Up Your Custom Domain (Optional)

If you want guests to see `thewestendflats.com/checkin/unit-1` instead of a generic URL:

1. In your hosting dashboard (Railway/Render/Fly), add a custom domain
2. Update your DNS records as instructed (usually a CNAME record)
3. SSL is handled automatically

---

## Step 5: Print QR Code Signs

1. Visit `https://yourdomain.com/signage/west-end-flats` (replace with your actual domain and property slug)
2. The form auto-fills from your property config
3. Adjust if needed, then click **Print**
4. Laminate the sign and place it at each property entrance

---

## Step 6: Verify the Guesty Check-In Form URL

**Important:** The app constructs a check-in form URL for each reservation. The default pattern is:

```
https://app.guestybooking.com/guest-app/{reservationId}
```

To confirm this works for your account:

1. Open a test reservation in Guesty
2. Go to **Operations → Guest App** and find the check-in form link for that reservation
3. Compare the URL pattern — if it's different, update the `buildCheckInFormUrl()` function in `server.js`

If Guesty returns a `guestAppUrl` field on the reservation object, the app uses that automatically.

---

## URLs Reference

| URL | Purpose |
|-----|---------|
| `/checkin/west-end-flats` | Guest check-in page for "West End Flats" |
| `/checkin/downtown-suites` | Guest check-in page for "Downtown Suites" |
| `/signage/west-end-flats` | Printable QR sign generator |
| `/api/property/west-end-flats` | Property config API (used by front-end) |
| `/api/lookup` | Reservation search API (POST) |

---

## Troubleshooting

**"Missing GUESTY_CLIENT_ID" error**
→ Make sure your environment variables are set in your hosting platform

**Reservation not found, but guest has a booking**
→ Check that the listing ID in `properties.json` matches the actual Guesty listing ID
→ Ensure the reservation status is "confirmed" or "checked_in"
→ The search window is ±48 hours from now — old reservations won't appear

**QR code sign doesn't load**
→ The signage page loads the QRCode.js library from CDN. Make sure the server has internet access.

**Check-in form URL doesn't work**
→ See Step 6 above. The URL pattern may be different for your Guesty account.

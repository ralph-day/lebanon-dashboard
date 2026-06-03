# Deployment Guide — Lebanon Dashboard

## Prerequisites
Node.js 18+ on your server, and two Google Cloud credentials (takes ~15 min to set up).

---

## Step 1 — Google Cloud Setup

### A. OAuth 2.0 (for team sign-in)
1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Create **OAuth 2.0 Client ID** (Web application)
3. Add Authorized redirect URI: `https://your-domain.com/auth/callback`
4. Copy **Client ID** and **Client Secret**

### B. Service Account (for Google Drive access)
1. Go to Credentials → Create Service Account
2. Name it `lebanon-dashboard-reader`
3. Download the JSON key file
4. Go to your Google Drive folder (ID: `1DGavGDKXsZby7cmUtOK6jn9w9CJyiJyW`)
5. Share the folder with the service account email (Viewer access)

---

## Step 2 — Environment Variables

Copy `.env.example` to `.env` in the `server/` folder and fill in:

```env
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/callback

# Paste the entire service account JSON as one line:
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}

ALLOWED_DOMAIN=influeanswers.com
DRIVE_FOLDER_ID=1DGavGDKXsZby7cmUtOK6jn9w9CJyiJyW

SESSION_SECRET=generate-a-long-random-string-here
CLIENT_URL=https://your-domain.com

PORT=3001
NODE_ENV=production
```

---

## Step 3 — Build & Deploy

```bash
# On your server — clone or upload the project folder, then:

# Install dependencies
cd server && npm install
cd ../client && npm install

# Build the frontend
cd client && npm run build

# Start the server (serves both API and built frontend)
cd ../server
NODE_ENV=production node index.js
```

The server will:
- Serve the React app from `client/dist/`
- Handle Google OAuth at `/auth/login` and `/auth/callback`
- Poll Google Drive every 15 min for the latest Excel file
- Serve the dashboard at `/`

---

## Step 4 — Process Manager (keep it running)

```bash
npm install -g pm2

# Start
pm2 start server/index.js --name "lebanon-dashboard" --env production

# Auto-restart on server reboot
pm2 startup
pm2 save
```

---

## Step 5 — Nginx Reverse Proxy (optional but recommended)

```nginx
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then run: `certbot --nginx -d your-domain.com` for HTTPS.

---

## Adding team members

In your `.env`, either:
- Set `ALLOWED_DOMAIN=influeanswers.com` — anyone with that email domain can sign in
- Or set `ALLOWED_EMAILS=ralph@influeanswers.com,teammate@gmail.com` — specific emails

---

## Updating the enumerator phone numbers

Edit `server/enumeratorConfig.js` and fill in the `phone` fields — they'll appear as call buttons in the anomaly alerts.

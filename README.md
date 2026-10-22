# MASAR Real Estate — Website + Admin Dashboard

A bilingual (English/Arabic) real-estate website starter with a real SQLite database, property management, lead capture, admin login, CSV lead export, and optional WhatsApp Cloud API notifications.

## Requirements
- Node.js 20 or newer
- npm

## Run locally
1. Extract the project folder.
2. Open a terminal in the project folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create your environment file:
   - Windows PowerShell: `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`
5. Edit `.env`. Change `ADMIN_PASSWORD` and `SESSION_SECRET` before using this beyond local testing. Add your business WhatsApp number in international digits-only format.
6. Start the app:
   ```bash
   npm start
   ```
7. Visit `http://localhost:3000` for the public website and `http://localhost:3000/admin` for the admin dashboard.

The database file `masar.sqlite` is created automatically on first run and includes a few sample listings to demonstrate the site. Delete the database file while the app is stopped if you want a fresh database; the sample listings and initial admin will be created again.

## Admin access
Initial defaults in `.env.example` are for local development only:
- Username: `admin`
- Password: `ChangeThisPassword123!`

Change them in `.env` before first start. If a database already exists, changing `ADMIN_PASSWORD` alone will not update an existing admin password. For a deployed site, use a unique strong password and keep `.env` private.

## WhatsApp links vs automated notifications
- **Customer-to-business WhatsApp button:** Set `BUSINESS_WHATSAPP` to your business number in international format without `+` or spaces. Property cards then show a WhatsApp contact link.
- **Automatic lead notification to your team:** Configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_NOTIFY_TO` from a WhatsApp Business Platform / Cloud API setup. The destination must be eligible to receive messages under Meta's WhatsApp policies. Test in a development environment first.
- If those Cloud API values are empty, leads are still stored in SQLite and visible in the admin dashboard; no automated WhatsApp alert is sent.

## Included features
- English/Arabic public site with language toggle and RTL layout.
- Interest wizard: Sheikh Zayed / 6th of October / Hadayek October / another area; Primary / Resale; Residential / Commercial; contact details, budget and notes.
- Public property listings with area/market/category filters and details modal.
- Contact lead form on listings, WhatsApp link, optional request-a-call flow.
- Admin login and dashboard with stats, add/edit/hide/delete properties, lead statuses, WhatsApp contact shortcut, delete lead, CSV export.
- Server-side SQLite storage and password-hashed admin credentials.

## Before production launch
This is a runnable starter, not yet a fully hardened production deployment. Before collecting real customer data, use HTTPS, a strong unique `SESSION_SECRET`, a strong admin password, persistent disk backups for `masar.sqlite`, proper hosting, and a production session store (the default Express MemoryStore is for development only). Consider adding rate limiting, CSRF protection, an account recovery process, and privacy/consent language appropriate for your business. Property photos currently use image URLs; use trusted image hosting or add authenticated uploads if you want to upload files directly. Use only accurate listings and images you have rights to use.

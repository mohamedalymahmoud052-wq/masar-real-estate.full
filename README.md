# MASAR Real Estate — Original Design (GitHub Pages + Supabase)

This package restores the original MASAR design with the architectural hero image, search journey, listings, a dedicated Lands section separate from the Residential/Commercial search journey, Arabic/English toggle, property detail modal, and WhatsApp links. It uses GitHub Pages for hosting and Supabase for data/auth/storage.

## Important
- `config.js` contains the Supabase Project URL and public publishable key. Never put a service-role/secret key or database password in a public repository.
- The database schema is in `supabase-setup.sql`; it was already run for this project, so do not run it again unless you intentionally need to recreate/setup the schema.
- Admin page: `admin.html`. Sign in with the Supabase Authentication user that was added to `public.masar_admins`.
- To deploy, upload the CONTENTS of this folder to the root of the existing GitHub repository, replacing files with the same names, then wait for GitHub Pages to rebuild.
- Automatic WhatsApp push notifications are not enabled by this static package; property WhatsApp links are available.


Land category update: if your Supabase project was already created, run `supabase-update-land-market.sql` once in Supabase SQL Editor so land listings no longer require Primary/Resale. Do not rerun the full setup SQL. The visitor journey is Area → Residential/Commercial → Primary/Resale, then matching listings appear. Lands remain in their own section and are not filtered by that journey.

# MOOW / LEXIE Refund CRM

This folder is the production foundation for the CRM:

- static frontend files (`index.html`, `styles.css`, `app.js`)
- Vercel serverless functions in `api/`
- Supabase schema in `supabase/schema.sql`
- bootstrap script for the first admin user in `scripts/bootstrap-admin.mjs`

## Before deployment

1. In Supabase, open the SQL editor and run `supabase/schema.sql`.
2. In Vercel, add these environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_EMAIL_DOMAIN` (example: `crm.local`)
3. Locally, copy `.env.example` to `.env` and fill in the values.
4. Run `npm run bootstrap:admin` once to create the first admin user.

## Notes

- Frontend users log in with `login + password`.
- Under the hood each login becomes a synthetic email like `login@crm.local`.
- Secret keys must stay only in Vercel environment variables or a local `.env` file.

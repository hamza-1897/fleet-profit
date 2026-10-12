# Fleet Profit

React + Vite + Tailwind + Supabase. Replaces the monthly Excel sheets.

1. Supabase: create a project, open SQL Editor, run `supabase/schema.sql`.
2. Supabase > Authentication: add one user (email + password, auto-confirm) and turn off "Allow new users to sign up".
3. Copy `.env.example` to `.env`, fill in the Project URL and the anon public key (Project Settings > API).
4. `npm install` then `npm run dev`.
5. Deploy: push to GitHub and import on Vercel/Netlify (add the same two variables there).

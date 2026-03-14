# AI Coding Mentor MVP

Frontend-only MVP built with React + Vite, Monaco Editor, Supabase Auth/DB, and Gemini API.

## Stack

- React + Vite
- Tailwind CSS (utility classes)
- Monaco Editor (`@monaco-editor/react`)
- Supabase (`@supabase/supabase-js`)
- Gemini API (`gemini-2.0-flash`)
- Netlify deploy target

## Environment

Create a `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set values:

- `VITE_GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Supabase Setup

Run the SQL block found at the top of:

- `src/lib/supabaseClient.js`

in the Supabase SQL editor.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy (Netlify)

`netlify.toml` is included with:

- build command: `npm run build`
- publish dir: `dist`
- SPA redirect to `index.html`

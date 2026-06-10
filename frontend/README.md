# PostMail AI Frontend

Next.js frontend for PostMail AI. It provides the prompt form, tone and purpose selectors, generated email preview, quick edit actions, copy button, prompt suggestions, and recent generations UI.

## Setup

```bash
cd frontend
npm install
```

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Run

```bash
npm run dev
```

Frontend URL:

```text
http://localhost:3000
```

## Features

- Responsive two-column desktop layout
- Single-column mobile layout
- Custom mobile-friendly dropdowns
- Loading, empty, success, and error states
- Groq-powered prompt ideas that refresh every 10 seconds
- Shorten, elaborate, and rewrite actions
- Copy-to-clipboard
- Recent generation delete modal with scroll lock

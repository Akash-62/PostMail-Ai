# PostMail AI Backend

FastAPI backend for PostMail AI. It validates email requests, builds structured AI prompts, calls Gemini first, and falls back to Groq if Gemini fails.

## Setup

```bash
cd backend
python -m pip install -r requirements.txt
```

Create a `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

## Run

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

API docs:

```text
http://127.0.0.1:8000/docs
```

## Endpoints

- `GET /` health check
- `POST /generate-email` generate a subject and email body
- `POST /refine-email` shorten, elaborate, or rewrite an email
- `GET /prompt-ideas` return Groq-generated prompt suggestions
- `GET /history` return in-memory prompt history

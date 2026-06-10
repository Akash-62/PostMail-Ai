import logging
import os
import re
import json
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

ENV_PATH = Path(__file__).resolve().with_name(".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

logger = logging.getLogger("postmail-ai")

GEMINI_MODEL = "gemini-2.5-flash"
GROQ_MODEL = "llama-3.1-8b-instant"

Tone = Literal["Professional", "Friendly", "Formal", "Casual"]
Purpose = Literal[
    "Interview Follow-up",
    "Leave Request",
    "Cold Outreach",
    "Client Update",
    "Apology Email",
    "Custom",
]


class EmailRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=500)
    tone: Tone
    purpose: Purpose

    @field_validator("prompt")
    @classmethod
    def normalize_prompt(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 5:
            raise ValueError("Prompt must be at least 5 characters long.")
        if len(cleaned) > 500:
            raise ValueError("Prompt must be 500 characters or fewer.")
        return cleaned


class EmailResponse(BaseModel):
    subject: str
    email: str
    provider: str


class RefineEmailRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=200)
    email: str = Field(..., min_length=20, max_length=4000)
    tone: Tone
    purpose: Purpose
    action: Literal["shorten", "elaborate", "regenerate"]

    @field_validator("subject", "email")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Value cannot be empty.")
        return cleaned


class HistoryItem(BaseModel):
    prompt: str
    tone: Tone
    purpose: Purpose
    subject: str
    email: str
    provider: str


class HistoryResponse(BaseModel):
    history: list[HistoryItem]


class PromptIdea(BaseModel):
    label: str
    prompt: str


class PromptIdeasResponse(BaseModel):
    ideas: list[PromptIdea]


app = FastAPI(
    title="PostMail AI API",
    description="FastAPI backend for AI email generation with Gemini and Groq fallback.",
    version="1.0.0",
)

default_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
extra_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=default_origins + extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

email_history: list[HistoryItem] = []


def build_email_prompt(prompt: str, tone: str, purpose: str) -> str:
    return f"""You are an expert professional email writing assistant.

Generate a complete email based on the user's request.

User request:
{prompt}

Selected tone:
{tone}

Email purpose:
{purpose}

Rules:

1. Generate a clear and useful email subject.
2. Generate a complete email body.
3. Match the selected tone.
4. Match the selected email purpose.
5. Keep the email concise, natural, and professional.
6. Do not include unnecessary explanation.
7. Do not include markdown.
8. Return the output exactly in this format:

Subject: <email subject>

Email: <email body>
"""


def build_refine_prompt(
    subject: str,
    email: str,
    tone: str,
    purpose: str,
    action: str,
) -> str:
    action_rules = {
        "shorten": (
            "Make the email shorter and sharper while keeping the same meaning, "
            "professional quality, and ready-to-send structure."
        ),
        "elaborate": (
            "Expand the email with a little more helpful context, warmth, and clarity "
            "without making it too long."
        ),
        "regenerate": (
            "Create a fresh improved version with stronger wording, a clearer subject, "
            "and a polished professional flow."
        ),
    }

    return f"""You are an expert professional email writing assistant.

Refine the existing email based on the requested action.

Requested action:
{action_rules[action]}

Selected tone:
{tone}

Email purpose:
{purpose}

Current subject:
{subject}

Current email:
{email}

Rules:

1. Generate a clear and useful email subject.
2. Generate a complete email body.
3. Match the selected tone.
4. Match the selected email purpose.
5. Keep the email natural, polished, and ready to send.
6. Do not include unnecessary explanation.
7. Do not include markdown.
8. Return the output exactly in this format:

Subject: <email subject>

Email: <email body>
"""


def generate_with_gemini(email_prompt: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Gemini API key is not configured.")

    from google import genai

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=email_prompt,
    )
    text = getattr(response, "text", "") or ""
    if not text.strip():
        raise ValueError("Gemini returned an empty response.")
    return text.strip()


def generate_with_groq(email_prompt: str) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("Groq API key is not configured.")

    from groq import Groq

    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are an expert professional email writing assistant.",
            },
            {"role": "user", "content": email_prompt},
        ],
        temperature=0.4,
    )
    text = response.choices[0].message.content or ""
    if not text.strip():
        raise ValueError("Groq returned an empty response.")
    return text.strip()


def generate_prompt_ideas_with_groq() -> list[PromptIdea]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("Groq API key is not configured.")

    from groq import Groq

    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You create concise, practical email prompt ideas.",
            },
            {
                "role": "user",
                "content": """Generate 5 fresh email prompt suggestions for an AI email generator.

Rules:
1. Ideas must be useful for work, career, clients, school, or everyday communication.
2. Each label must be short, clear, and clickable.
3. Each prompt must be a complete email generation request.
4. Do not repeat common examples like interview follow-up or leave request every time.
5. Return only valid JSON in this exact shape:

[
  {"label": "Short label", "prompt": "Complete prompt"},
  {"label": "Short label", "prompt": "Complete prompt"}
]
""",
            },
        ],
        temperature=0.9,
    )
    text = response.choices[0].message.content or ""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    parsed = json.loads(cleaned)

    if not isinstance(parsed, list):
        raise ValueError("Groq prompt ideas response was not a list.")

    ideas = [
        PromptIdea(
            label=str(item["label"]).strip()[:60],
            prompt=str(item["prompt"]).strip()[:500],
        )
        for item in parsed
        if isinstance(item, dict)
        and str(item.get("label", "")).strip()
        and str(item.get("prompt", "")).strip()
    ]

    if len(ideas) < 3:
        raise ValueError("Groq returned too few valid prompt ideas.")

    return ideas[:5]


def parse_ai_response(text: str) -> dict[str, str]:
    match = re.search(
        r"Subject:\s*(?P<subject>.*?)\s*Email:\s*(?P<email>.*)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise ValueError("AI response did not include Subject and Email sections.")

    subject = match.group("subject").strip()
    email = match.group("email").strip()

    if not subject or not email:
        raise ValueError("AI response was missing a subject or email body.")

    return {"subject": subject, "email": email}


def generate_email_with_fallback(email_prompt: str) -> dict[str, str]:
    try:
        gemini_text = generate_with_gemini(email_prompt)
        parsed = parse_ai_response(gemini_text)
        return {**parsed, "provider": "Gemini"}
    except Exception as exc:
        logger.warning("Gemini generation failed: %s", exc)

    try:
        groq_text = generate_with_groq(email_prompt)
        parsed = parse_ai_response(groq_text)
        return {**parsed, "provider": "Groq"}
    except Exception as exc:
        logger.warning("Groq generation failed: %s", exc)

    raise RuntimeError("All AI providers failed.")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "PostMail AI API is running"}


@app.get("/prompt-ideas", response_model=PromptIdeasResponse)
def get_prompt_ideas() -> PromptIdeasResponse:
    try:
        ideas = generate_prompt_ideas_with_groq()
    except Exception as exc:
        logger.warning("Groq prompt idea generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to refresh ideas right now. Please try again.",
        ) from exc

    return PromptIdeasResponse(ideas=ideas)


@app.post("/generate-email", response_model=EmailResponse)
def generate_email(request: EmailRequest) -> EmailResponse:
    email_prompt = build_email_prompt(
        prompt=request.prompt,
        tone=request.tone,
        purpose=request.purpose,
    )

    try:
        generated = generate_email_with_fallback(email_prompt)
    except RuntimeError as exc:
        logger.error("Email generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to generate email right now. Please try again.",
        ) from exc

    response = EmailResponse(**generated)
    email_history.insert(
        0,
        HistoryItem(
            prompt=request.prompt,
            tone=request.tone,
            purpose=request.purpose,
            subject=response.subject,
            email=response.email,
            provider=response.provider,
        ),
    )
    del email_history[10:]

    return response


@app.post("/refine-email", response_model=EmailResponse)
def refine_email(request: RefineEmailRequest) -> EmailResponse:
    email_prompt = build_refine_prompt(
        subject=request.subject,
        email=request.email,
        tone=request.tone,
        purpose=request.purpose,
        action=request.action,
    )

    try:
        generated = generate_email_with_fallback(email_prompt)
    except RuntimeError as exc:
        logger.error("Email refinement failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to refine email right now. Please try again.",
        ) from exc

    response = EmailResponse(**generated)
    email_history.insert(
        0,
        HistoryItem(
            prompt=f"Refine action: {request.action}",
            tone=request.tone,
            purpose=request.purpose,
            subject=response.subject,
            email=response.email,
            provider=response.provider,
        ),
    )
    del email_history[10:]

    return response


@app.get("/history", response_model=HistoryResponse)
def get_history() -> HistoryResponse:
    return HistoryResponse(history=email_history[:10])

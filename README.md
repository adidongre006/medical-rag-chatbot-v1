# 🩺 Medical RAG Chatbot

FastAPI + LangChain + Pinecone backend, Next.js 16 + Tailwind CSS 4 chat UI.

> **Educational use only.** Not clinically validated; not a substitute for professional medical advice. In an emergency, call your local emergency number.

| Part | Path | Stack |
| --- | --- | --- |
| API | [`backend/`](backend) | FastAPI, Pydantic v2, LangChain, Pinecone, Hugging Face |
| Web | [`frontend/`](frontend) | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4 |
| Original app | [`legacy/`](legacy) | Flask (kept until the new stack is verified — safe to delete after) |

```bash
# quickest start (needs Docker + your keys in backend/.env)
cp backend/.env.example backend/.env   # then edit it
docker compose up --build              # UI http://localhost:3000 · API docs http://localhost:8000/docs
```

First run on a new machine? `./verify.sh` runs every quality gate (lint, types, tests, build) and writes a pasteable report.

**Everything else — keys, ingestion, local dev, tests, AWS deployment, troubleshooting — is in [`guide.md`](guide.md).**

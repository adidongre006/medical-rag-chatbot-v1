"""RAG service: builds the LangChain retrieval chain once and exposes async APIs.

The original Flask app built the chain at import time and called the blocking
`invoke`. Here the (slow) build happens in the FastAPI lifespan and every
request uses `ainvoke` / `astream`.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal, Protocol

from langchain_groq import ChatGroq
from starlette.concurrency import run_in_threadpool

from app.schemas.chat import ChatTurn, Source
from app.services.prompts import CONTEXTUALIZE_PROMPT, SYSTEM_PROMPT

if TYPE_CHECKING:
    from app.core.config import Settings

logger = logging.getLogger(__name__)

SNIPPET_CHARS = 280


class ChainLike(Protocol):
    """The subset of a LangChain runnable that the service relies on."""

    async def ainvoke(self, input: dict[str, Any], **kwargs: Any) -> dict[str, Any]: ...

    def astream(self, input: dict[str, Any], **kwargs: Any) -> AsyncIterator[dict[str, Any]]: ...


StreamItem = tuple[Literal["sources"], list[Source]] | tuple[Literal["token"], str]


def to_sources(docs: list[Any]) -> list[Source]:
    """Convert retrieved LangChain `Document`s to API `Source`s (deduplicated)."""
    seen: set[tuple[str, int | None, str]] = set()
    result: list[Source] = []
    for doc in docs:
        metadata = getattr(doc, "metadata", None) or {}
        raw_source = str(metadata.get("source") or "unknown")
        source = os.path.basename(raw_source.replace("\\", "/")) or "unknown"
        raw_page = metadata.get("page")
        # PyPDFLoader pages are 0-indexed; show human page numbers.
        page = int(raw_page) + 1 if isinstance(raw_page, (int, float)) else None
        snippet = " ".join(str(getattr(doc, "page_content", "")).split())[:SNIPPET_CHARS]
        key = (source, page, snippet[:80])
        if key in seen:
            continue
        seen.add(key)
        result.append(Source(source=source, page=page, snippet=snippet))
    return result


def to_chat_history(history: list[ChatTurn]) -> list[Any]:
    from langchain_core.messages import AIMessage, HumanMessage

    return [
        HumanMessage(content=turn.content) if turn.role == "user" else AIMessage(content=turn.content)
        for turn in history
    ]


@dataclass
class RAGService:
    chain: ChainLike
    index_name: str = "medical-chatbot"
    probe: Callable[[], Any] | None = None

    # ------------------------------------------------------------------ build
    @classmethod
    def build(cls, settings: Settings) -> RAGService:
        """Heavy, blocking construction. Call via `run_in_threadpool` at startup."""
        from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
        from langchain_classic.chains.combine_documents import create_stuff_documents_chain
        from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
        from langchain_huggingface import ChatHuggingFace, HuggingFaceEmbeddings, HuggingFaceEndpoint
        from langchain_pinecone import PineconeVectorStore
        from pinecone import Pinecone
        from langchain_groq import ChatGroq
        from dotenv import load_dotenv
        # import os
        # from langchain_groq import ChatGroq

        load_dotenv()

        embeddings = HuggingFaceEmbeddings(model_name=settings.embedding_model)

        index = Pinecone(api_key=settings.pinecone_api_key.get_secret_value()).Index(settings.pinecone_index)
        vector_store = PineconeVectorStore(index=index, embedding=embeddings)
        retriever = vector_store.as_retriever(
            search_type="similarity", search_kwargs={"k": settings.retriever_k}
        )

        endpoint = HuggingFaceEndpoint(
            repo_id=settings.hf_repo_id,
            task="text-generation",
            huggingfacehub_api_token=settings.hf_token.get_secret_value(),
            max_new_tokens=settings.max_new_tokens,
        )

        # ------------------------------------------
        # hugging face 
        # chat_model = ChatHuggingFace(llm=endpoint)



        # ------------------------------------------
        ## Chat Groq
        chat_model  = ChatGroq(
    api_key=os.environ.get("Groq_API_KEY"),
    model="openai/gpt-oss-120b",
    temperature=0.7,
   )
    

        contextualize_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", CONTEXTUALIZE_PROMPT),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        history_aware_retriever = create_history_aware_retriever(chat_model, retriever, contextualize_prompt)

        qa_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
            ]
        )
        qa_chain = create_stuff_documents_chain(chat_model, qa_prompt)
        chain = create_retrieval_chain(history_aware_retriever, qa_chain)

        logger.info("RAG chain ready (index=%s, model=%s)", settings.pinecone_index, settings.hf_repo_id)
        return cls(chain=chain, index_name=settings.pinecone_index, probe=index.describe_index_stats)

    # ---------------------------------------------------------------- queries
    def _inputs(self, message: str, history: list[ChatTurn]) -> dict[str, Any]:
        return {"input": message, "chat_history": to_chat_history(history)}

    async def answer(self, message: str, history: list[ChatTurn]) -> tuple[str, list[Source]]:
        result = await self.chain.ainvoke(self._inputs(message, history))
        return str(result.get("answer", "")).strip(), to_sources(result.get("context", []) or [])

    async def stream(self, message: str, history: list[ChatTurn]) -> AsyncIterator[StreamItem]:
        """Yield `("sources", [...])` once, then `("token", text)` repeatedly."""
        async for chunk in self.chain.astream(self._inputs(message, history)):
            if "context" in chunk:
                yield "sources", to_sources(chunk["context"] or [])
            answer = chunk.get("answer")
            if answer:
                yield "token", str(answer)

    async def ping(self) -> bool:
        """Cheap reachability probe of the vector index (used by /ready)."""
        if self.probe is None:
            return True
        try:
            await run_in_threadpool(self.probe)
        except Exception:
            logger.exception("Readiness probe failed")
            return False
        return True

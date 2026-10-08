"""PDF -> chunks -> embeddings -> Pinecone ingestion.

Replaces the original `src/helper.py` + `store_index.py`.

Usage (from `backend/`):
    python -m app.services.ingest                 # ingest ./data/*.pdf
    python -m app.services.ingest --data-dir data --chunk-size 500
"""

from __future__ import annotations

import argparse
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from langchain_core.documents import Document

logger = logging.getLogger("ingest")

EMBEDDING_DIMENSION = 384  # all-MiniLM-L6-v2


def load_pdf_file(data_dir: str) -> list[Document]:
    from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader

    loader = DirectoryLoader(data_dir, glob="*.pdf", loader_cls=PyPDFLoader)
    return loader.load()


def filter_to_minimal_docs(docs: list[Document]) -> list[Document]:
    """Keep only `source` and `page` metadata.

    The original kept just `source`; `page` is retained so the UI can show
    page-level citations. (Re-run ingestion to add pages to an existing index.)
    """
    from langchain_core.documents import Document

    minimal: list[Document] = []
    for doc in docs:
        metadata = {"source": doc.metadata.get("source")}
        if doc.metadata.get("page") is not None:
            metadata["page"] = doc.metadata["page"]
        minimal.append(Document(page_content=doc.page_content, metadata=metadata))
    return minimal


def text_split(docs: list[Document], chunk_size: int = 500, chunk_overlap: int = 20) -> list[Document]:
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    return splitter.split_documents(docs)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Ingest PDFs into the Pinecone index.")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--chunk-size", type=int, default=500)
    parser.add_argument("--chunk-overlap", type=int, default=20)
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    from langchain_huggingface import HuggingFaceEmbeddings
    from langchain_pinecone import PineconeVectorStore
    from pinecone import Pinecone, ServerlessSpec

    from app.core.config import get_settings

    settings = get_settings()

    documents = load_pdf_file(args.data_dir)
    if not documents:
        raise SystemExit(f"No PDF files found in {args.data_dir!r}")
    chunks = text_split(filter_to_minimal_docs(documents), args.chunk_size, args.chunk_overlap)
    logger.info("Loaded %d pages -> %d chunks", len(documents), len(chunks))

    embeddings = HuggingFaceEmbeddings(model_name=settings.embedding_model)

    pc = Pinecone(api_key=settings.pinecone_api_key.get_secret_value())
    if not pc.has_index(settings.pinecone_index):
        logger.info("Creating index %r (dim=%d, cosine)", settings.pinecone_index, EMBEDDING_DIMENSION)
        pc.create_index(
            name=settings.pinecone_index,
            dimension=EMBEDDING_DIMENSION,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )

    index = pc.Index(settings.pinecone_index)
    PineconeVectorStore(index=index, embedding=embeddings).add_documents(chunks)
    stats = index.describe_index_stats()
    logger.info("Done. Index now holds %s vectors.", stats.get("total_vector_count", "?"))


if __name__ == "__main__":
    main()

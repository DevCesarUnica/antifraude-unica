"""
Aplicação FastAPI — ponto de entrada do backend V2.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging
from app.database import engine, Base
from app.routers import propostas, regras, titan, auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    # Cria tabelas no banco (Alembic faz isso em produção; aqui é para dev)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Antifraude API V2",
    description="Sistema antifraude para análise de propostas de crédito",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(propostas.router)
app.include_router(regras.router)
app.include_router(titan.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}

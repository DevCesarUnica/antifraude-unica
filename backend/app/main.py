"""
Aplicação FastAPI — ponto de entrada do backend V2.
"""

import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configurar_logs as configure_logging
from app.database import engine, Base, SessionLocal
from app.routers import (
    propostas, regras, titan, auth, bancos, usuarios, storm,
    convenios, corretores, grupos, layouts, importacoes,
    averbacoes, retornos_banco, pendencias, logs, relatorios,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Antifraude API V2",
    description="Sistema antifraude para análise de propostas de crédito",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Middleware de log de acesso ────────────────────────────────────────────────

@app.middleware("http")
async def log_acesso_middleware(request: Request, call_next):
    inicio = time.monotonic()
    response = await call_next(request)
    duracao_ms = int((time.monotonic() - inicio) * 1000)

    # Só persiste para rotas da API (ignora /health, /docs, /openapi.json)
    path = request.url.path
    if path.startswith("/api") or (
        not any(path.startswith(p) for p in ("/health", "/docs", "/openapi", "/redoc"))
    ):
        try:
            db = SessionLocal()
            from app.models import LogAcesso
            log = LogAcesso(
                usuario_id=request.headers.get("x-usuario-id"),
                username=request.headers.get("x-usuario"),
                metodo=request.method,
                endpoint=path,
                ip=request.client.host if request.client else None,
                status_code=response.status_code,
                duracao_ms=duracao_ms,
            )
            db.add(log)
            db.commit()
        except Exception:
            pass
        finally:
            try:
                db.close()
            except Exception:
                pass

    return response


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(propostas.router)
app.include_router(regras.router)
app.include_router(titan.router)
app.include_router(bancos.router)
app.include_router(storm.router)
app.include_router(convenios.router)
app.include_router(corretores.router)
app.include_router(grupos.router)
app.include_router(layouts.router)
app.include_router(importacoes.router)
app.include_router(averbacoes.router)
app.include_router(retornos_banco.router)
app.include_router(pendencias.router)
app.include_router(logs.router)
app.include_router(relatorios.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.1.0"}

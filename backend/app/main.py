from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine
from app import models
from app.routers import propostas, corretores, grupos, regras, convenios, blacklist

# Cria todas as tabelas no banco ao iniciar
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Antifraude Unica Promotora",
    description="Sistema de mesa de credito com engine de regras antifraude",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(propostas.router, prefix="/propostas", tags=["Propostas"])
app.include_router(corretores.router, prefix="/corretores", tags=["Corretores"])
app.include_router(grupos.router, prefix="/grupos", tags=["Grupos"])
app.include_router(regras.router, prefix="/regras", tags=["Regras"])
app.include_router(convenios.router, prefix="/convenios", tags=["Convenios"])
app.include_router(blacklist.router, prefix="/blacklist", tags=["Blacklist"])


@app.get("/", tags=["Root"])
def root():
    return {"status": "ok", "sistema": "Antifraude Unica Promotora"}

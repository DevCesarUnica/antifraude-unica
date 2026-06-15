from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine
from app import models
from app.routers import propostas, corretores, grupos, regras, convenios, blacklist, auth, users
from app.routers.auth import get_current_user

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

app.include_router(auth.router, prefix="/auth", tags=["Autenticação"])
_auth_dep = [Depends(get_current_user)]
app.include_router(propostas.router, prefix="/propostas", tags=["Propostas"], dependencies=_auth_dep)
app.include_router(corretores.router, prefix="/corretores", tags=["Corretores"], dependencies=_auth_dep)
app.include_router(grupos.router, prefix="/grupos", tags=["Grupos"], dependencies=_auth_dep)
app.include_router(regras.router, prefix="/regras", tags=["Regras"], dependencies=_auth_dep)
app.include_router(convenios.router, prefix="/convenios", tags=["Convenios"], dependencies=_auth_dep)
app.include_router(blacklist.router, prefix="/blacklist", tags=["Blacklist"], dependencies=_auth_dep)
app.include_router(users.router, prefix="/users", tags=["Usuários"])


@app.get("/", tags=["Root"])
def root():
    return {"status": "ok", "sistema": "Antifraude Unica Promotora"}

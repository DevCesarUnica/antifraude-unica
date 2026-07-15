# Antifraude Unica

Sistema Antifraude e Automação de Propostas Financeiras — Unica Promotora

Desenvolvido por [cesaraaugustoo](https://github.com/cesaraaugustoo).

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.10+ / FastAPI / SQLAlchemy / PostgreSQL |
| Frontend | React 18 / Vite / TypeScript / Tailwind CSS |
| Autenticação | JWT (python-jose + bcrypt) |
| Containerização | Docker + docker-compose |

---

## Pré-requisitos

- Python 3.10+
- Node.js 18+
- PostgreSQL 15+ rodando localmente

---

## Como rodar

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
```

Configure as variáveis de ambiente criando `backend/.env`:
```env
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/antifraude
SECRET_KEY=mude-em-producao
ENVIRONMENT=development
```

Inicie o servidor:
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

O banco é criado automaticamente na primeira execução. Um usuário admin padrão é criado se não existir nenhum usuário.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse: **http://localhost:3000**

---

## Usuário padrão

Criado automaticamente ao iniciar o backend pela primeira vez (se o banco estiver vazio):

| Usuário | Senha | Perfil |
|---|---|---|
| `admin` | `admin123` | Administrador |

> Altere a senha após o primeiro acesso.

---

## Hierarquia de permissões

| Ação | Admin | Gestor | Analista | Operador |
|---|:---:|:---:|:---:|:---:|
| Gerenciar usuários | ✅ | ✅* | ❌ | ❌ |
| Excluir usuários | ✅ | ✅* | ❌ | ❌ |
| Aprovar / reprovar proposta | ✅ | ✅ | ✅ | ❌ |
| Visualizar propostas | ✅ | ✅ | ✅ | ✅ |

*Gestor não pode alterar ou excluir admins.

---

## Estrutura do projeto

```
antifraude/
├── backend/
│   ├── app/
│   │   ├── core/          # Config, logging, circuit breaker
│   │   ├── routers/       # Endpoints: auth, usuarios, propostas, regras, bancos, titan
│   │   ├── services/      # Motor antifraude, auditoria, integração Titan, bancos
│   │   ├── workers/       # Tarefas Celery (processamento assíncrono)
│   │   ├── models.py      # Tabelas do banco (SQLAlchemy)
│   │   ├── schemas.py     # Validação de dados (Pydantic)
│   │   ├── database.py    # Conexão PostgreSQL
│   │   └── main.py        # Inicialização FastAPI
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/         # Dashboard, Propostas, Regras, Bancos, Usuários, Login
│       ├── components/    # Header, Layout
│       ├── app/           # Rotas Next.js (App Router)
│       └── lib/           # Cliente HTTP (Axios)
├── rpa/
│   └── playwright/        # Automação de bancos sem API
├── docs/                  # Documentação de discovery
├── docker-compose.yml     # Orquestração completa (backend + PostgreSQL + Redis)
└── .env.example           # Variáveis de ambiente de exemplo
```

---

## Docker (opcional)

Para rodar tudo com Docker:

```bash
cp .env.example .env
# Edite .env com suas configurações
docker-compose up -d
```

---

## Documentação

- `docs/` — Análise de requisitos e discovery do projeto
- `HIERARQUIA_USUARIOS.txt` — Permissões detalhadas por perfil

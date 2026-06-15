# Antifraude Unica

Sistema Antifraude e Automação de Propostas Financeiras — Unica Promotora

---

## Resumo

O sistema automatiza o processo de análise antifraude e aprovação de propostas de diferentes instituições financeiras. Aplica regras baseadas em perfis de corretores (esteiras), verificação de blacklist e decisões automáticas ou manuais, reduzindo processos manuais e otimizando a análise das propostas.

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.10+ / FastAPI / SQLAlchemy / SQLite |
| Frontend | React 18 / Vite / Zustand / Tailwind CSS |
| Autenticação | Token Bearer (UUID) com hash SHA-256 |

---

## Como rodar o projeto

### Pré-requisitos

- Python 3.10 ou superior
- Node.js 18 ou superior
- Git

---

### 1. Clonar o repositório

```bash
git clone https://github.com/DevCesarUnica/antifraude-unica.git
cd antifraude-unica
```

---

### 2. Configurar o Backend

```bash
cd backend
pip install -r requirements.txt
python seed.py
```

> **Por que esses comandos?**
>
> - `cd backend` — entra na pasta do backend, onde estão os arquivos Python. O `seed.py` precisa ser executado de dentro dessa pasta porque ele localiza o banco de dados (`antifraude.db`) e os módulos do projeto (`app/`) usando caminhos relativos. Se rodar de fora da pasta, o Python não encontra os arquivos e dá erro de importação.
>
> - `python seed.py` — o banco de dados **não vai para o repositório** (está no `.gitignore`). Isso significa que ao clonar o projeto, o banco existe mas está completamente vazio — sem nenhum usuário, grupo, corretor ou proposta. O `seed.py` é o script que cria e popula tudo isso: cria as tabelas, cadastra os 5 usuários padrão e insere dados de exemplo para o sistema funcionar.

---

### 3. Iniciar o Backend

Abra um terminal e deixe rodando:

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Aguarde aparecer:
```
INFO: Uvicorn running on http://127.0.0.1:8000
```

---

### 4. Configurar o Frontend

Abra **outro terminal**:

```bash
cd frontend
npm install
npm run dev
```

Aguarde aparecer:
```
VITE ready  →  Local: http://localhost:5173/
```

---

### 5. Acessar o sistema

Abra no navegador: **http://localhost:5173**

---

## Usuários padrão

Criados automaticamente pelo `seed.py`:

| Usuário | Senha | Perfil |
|---|---|---|
| `admin` | `admin123` | Administrador |
| `cesar` | `cesar123` | Gestor |
| `leo` | `leo123` | Analista |
| `julia` | `julia123` | Analista |
| `sergio` | `sergio123` | Operador |

> As senhas devem ser alteradas em produção.

---

## Hierarquia de permissões

| Ação | Admin | Gestor | Analista | Operador |
|---|:---:|:---:|:---:|:---:|
| Criar / editar usuários | ✅ | ❌ | ❌ | ❌ |
| Ver lista de usuários | ✅ | ✅ | ❌ | ❌ |
| Aprovar / reprovar proposta | ✅ | ✅ | ✅ | ❌ |
| Alterar status de proposta | ✅ | ✅ | ✅ | ✅ |

---

## Estrutura do projeto

```
antifraude/
├── backend/
│   ├── app/
│   │   ├── routers/       # Endpoints da API
│   │   ├── services/      # Engine de regras antifraude
│   │   ├── models.py      # Tabelas do banco
│   │   ├── schemas.py     # Validação de dados
│   │   └── main.py        # Inicialização da API
│   ├── seed.py            # Popula o banco com dados iniciais
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/         # Dashboard, Login, Usuários
        ├── components/    # Header, Cards, Tabela
        ├── store/         # Estado global (Zustand)
        └── services/      # Comunicação com a API
```

---

## Documentação

- `DOCUMENTACAO_TECNICA.txt` — explicação detalhada de cada arquivo do projeto
- `HIERARQUIA_USUARIOS.txt` — permissões completas de cada perfil de usuário

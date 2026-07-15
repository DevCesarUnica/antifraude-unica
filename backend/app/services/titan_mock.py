"""
Dados mock da API Titan/Hope — usados quando a chave real não está disponível.

Estrutura espelha exatamente o que a API real retorna, baseado na collection
do Insomnia fornecida. Substitua pela chave real em .env quando disponível.
"""

BANKS: list[dict] = [
    {"id": 1,  "code": "001", "name": "Banco do Brasil"},
    {"id": 2,  "code": "033", "name": "Santander"},
    {"id": 3,  "code": "104", "name": "Caixa Econômica Federal"},
    {"id": 4,  "code": "237", "name": "Bradesco"},
    {"id": 5,  "code": "341", "name": "Itaú Unibanco"},
    {"id": 6,  "code": "389", "name": "Banco Mercantil do Brasil"},
    {"id": 7,  "code": "422", "name": "Banco Safra"},
    {"id": 8,  "code": "623", "name": "Banco Pan"},
    {"id": 9,  "code": "626", "name": "Banco C6"},
    {"id": 10, "code": "655", "name": "Votorantim"},
    {"id": 11, "code": "707", "name": "Banco Daycoval"},
    {"id": 12, "code": "746", "name": "Banco Modal"},
    {"id": 13, "code": "756", "name": "Banco Cooperativo Sicoob"},
]

SEXES: list[dict] = [
    {"id": 1, "code": "M", "name": "Masculino"},
    {"id": 2, "code": "F", "name": "Feminino"},
]

CIVIL_STATUSES: list[dict] = [
    {"id": 1, "code": "SOLTEIRO",   "name": "Solteiro(a)"},
    {"id": 2, "code": "CASADO",     "name": "Casado(a)"},
    {"id": 3, "code": "DIVORCIADO", "name": "Divorciado(a)"},
    {"id": 4, "code": "VIUVO",      "name": "Viúvo(a)"},
    {"id": 5, "code": "UNIAO",      "name": "União Estável"},
]

PROFESSIONS: list[dict] = [
    {"id": 1,  "code": "APOSENTADO",     "name": "Aposentado(a)"},
    {"id": 2,  "code": "PENSIONISTA",    "name": "Pensionista"},
    {"id": 3,  "code": "SERVIDOR",       "name": "Servidor Público"},
    {"id": 4,  "code": "MILITAR",        "name": "Militar"},
    {"id": 5,  "code": "CLT",            "name": "Empregado CLT"},
    {"id": 6,  "code": "AUTONOMO",       "name": "Autônomo"},
    {"id": 7,  "code": "EMPRESARIO",     "name": "Empresário"},
    {"id": 8,  "code": "PROFISSIONAL",   "name": "Profissional Liberal"},
    {"id": 9,  "code": "DESEMPREGADO",   "name": "Desempregado(a)"},
    {"id": 10, "code": "BENEFICIARIO",   "name": "Beneficiário INSS"},
]

DAYCOVAL_PRODUCTS: list[dict] = [
    {"id": 1, "code": "CONSIG_INSS",    "name": "Consignado INSS",          "productType": "CONSIGNADO"},
    {"id": 2, "code": "CONSIG_GOV",     "name": "Consignado Governo",       "productType": "CONSIGNADO"},
    {"id": 3, "code": "CONSIG_PRIVADO", "name": "Consignado Privado",       "productType": "CONSIGNADO"},
    {"id": 4, "code": "REFIN",          "name": "Refinanciamento",          "productType": "REFINANCIAMENTO"},
    {"id": 5, "code": "PORTAB",         "name": "Portabilidade",            "productType": "PORTABILIDADE"},
    {"id": 6, "code": "CARTAO_BENEF",   "name": "Cartão Benefício",         "productType": "CARTAO"},
    {"id": 7, "code": "FGTS",           "name": "Antecipação FGTS",         "productType": "FGTS"},
]

# Produtos genéricos usados quando o banco não tem catálogo específico no mock
PRODUTOS_GENERICOS: list[dict] = [
    {"id": 1, "code": "CONSIG_INSS", "name": "Consignado INSS",    "productType": "CONSIGNADO"},
    {"id": 2, "code": "CONSIG_GOV",  "name": "Consignado Governo",  "productType": "CONSIGNADO"},
    {"id": 3, "code": "PORTAB",      "name": "Portabilidade",        "productType": "PORTABILIDADE"},
    {"id": 4, "code": "FGTS",        "name": "Antecipação FGTS",    "productType": "FGTS"},
]

# Catálogo por banco_id (int). Bancos não listados recebem PRODUTOS_GENERICOS.
PRODUTOS_POR_BANCO: dict[int, list[dict]] = {
    11: DAYCOVAL_PRODUCTS,  # Banco Daycoval (código 707)
}

ALL: dict = {
    "banks": BANKS,
    "sexes": SEXES,
    "civil_statuses": CIVIL_STATUSES,
    "professions": PROFESSIONS,
    "daycoval_products": DAYCOVAL_PRODUCTS,
}

"""
Schemas Pydantic para a API Titan — Motor de cálculo externo.
"""

from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel


# ── Endereço ──────────────────────────────────────────────────────────────────

class TitanEndereco(BaseModel):
    postalCode: str
    countryID: int
    level1AdminDivID: int
    level2AdminDivID: int
    line1: str
    line2: Optional[str] = None
    houseNumber: str
    neighborhood: str
    mapUrl: Optional[str] = None


# ── Conta bancária ────────────────────────────────────────────────────────────

class TitanConta(BaseModel):
    agencyNumber: str
    accountNumber: str
    accountNumberDigit: str
    accountTypeID: int
    accountPixKeyTypeID: Optional[int] = None
    accountPixKey: Optional[str] = None
    bankCode: int
    primaryAccount: bool


# ── Pessoa física ─────────────────────────────────────────────────────────────

class TitanPessoa(BaseModel):
    email: str
    fullName: str
    documentNumber: str
    mobilePhoneNumber: Optional[str] = None
    landlinePhoneNumber: Optional[str] = None
    mothersFullName: Optional[str] = None
    fathersFullName: Optional[str] = None
    nationalityID: Optional[int] = None
    birthplaceLevel1AdminDivID: Optional[int] = None
    birthplaceLevel2AdminDivID: Optional[int] = None
    birthdate: Optional[str] = None
    civilStatusID: Optional[int] = None
    educationLevelID: Optional[int] = None
    sexID: Optional[int] = None
    netWorth: Optional[float] = None
    declaredIncome: Optional[float] = None
    accounts: list[TitanConta] = []
    socialNetworks: list[Any] = []
    occupations: list[Any] = []
    address: Optional[TitanEndereco] = None


# ── Cliente e avalista ────────────────────────────────────────────────────────

class TitanCliente(BaseModel):
    person: Optional[TitanPessoa] = None
    company: Optional[dict[str, Any]] = None


class TitanAvalista(BaseModel):
    person: Optional[TitanPessoa] = None
    company: Optional[dict[str, Any]] = None
    relationshipTypeID: int


# ── Garantia ──────────────────────────────────────────────────────────────────

class TitanGarantia(BaseModel):
    custodian: str
    documentNumber: str
    value: float
    description: Optional[str] = None
    collateralTypeID: int
    assetTypeID: int
    vehicle: Optional[dict[str, Any]] = None
    address: Optional[dict[str, Any]] = None
    financed: bool


# ── Parcela ───────────────────────────────────────────────────────────────────

class TitanParcela(BaseModel):
    index: int
    interestRate: Optional[float] = None
    baseIOFRate: Optional[float] = None
    additionalIOFRate: Optional[float] = None
    installmentFactor: Optional[float] = None
    valueWithoutIOF: Optional[float] = None
    amortization: float
    interest: float
    balance: Optional[float] = None
    baseIOFValue: Optional[float] = None
    additionalIOFValue: Optional[float] = None
    totalIOFValue: Optional[float] = None
    financedIOFValue: Optional[float] = None
    valueWithIOF: float
    dueDate: str


# ── Request principal ─────────────────────────────────────────────────────────

class TitanCriarOperacaoRequest(BaseModel):
    acceptanceDate: str
    firstDueDate: str
    installmentQuantity: int
    requestedValue: float
    downPayment: Optional[float] = None
    paymentFrequencyID: int
    paymentMethodID: int
    productID: int
    operationStatusID: int
    companyID: int
    companyType: str
    inPersonSale: bool = False
    tfc: Optional[float] = None
    tfcPct: Optional[float] = None
    monthlyInterestRate: float
    monthlyTEC: float
    yearlyTEC: float
    installmentValueWithIOF: float
    iofRate: float
    additionalIOFRate: float
    totalIOFValue: float
    financedIOFValue: float
    gracePeriod: int
    totalValue: float
    creditLifeInsurancePct: Optional[float] = None
    creditLifeInsurance: Optional[float] = None
    additionalInsuranceValue: Optional[float] = None
    financeIOF: bool
    financeTFC: bool
    financeCreditLifeInsurance: bool
    financeAdditionalInsurance: bool
    financedValue: float
    customer: TitanCliente
    guarantors: list[TitanAvalista] = []
    collaterals: list[TitanGarantia] = []
    installments: list[TitanParcela]

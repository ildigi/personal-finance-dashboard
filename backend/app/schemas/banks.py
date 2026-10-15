"""Banche via Enable Banking (Fase 8): stato, elenco banche, consenso."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import ApiModel, OrmModel
from app.schemas.sync import SyncSummaryRead


class BanksStatus(OrmModel):
    credentials_found: bool = Field(description="Ci sono application ID e chiave privata?")
    environment: str | None = Field(description="sandbox | production")
    redirect_url: str = Field(description="Da registrare identico nel Control Panel")


class BankRead(OrmModel):
    name: str
    country: str
    logo: str | None
    psu_types: list[str]
    max_consent_days: int | None
    beta: bool


class AuthorizeRequest(ApiModel):
    """Nuova banca (`aspsp_name` + `country`) oppure rinnovo di una sorgente (`source_id`:
    banca e paese si prendono dal consenso precedente)."""

    aspsp_name: str | None = Field(default=None, min_length=1, max_length=200)
    country: str = Field(pattern=r"^[A-Z]{2}$", default="IT")
    psu_type: Literal["personal", "business"] = "personal"
    source_id: int | None = Field(default=None, description="Sorgente di cui rinnovare il consenso")

    @model_validator(mode="after")
    def _bank_or_source(self) -> AuthorizeRequest:
        if self.aspsp_name is None and self.source_id is None:
            raise ValueError("Indica la banca (aspsp_name) o la sorgente da rinnovare (source_id)")
        return self


class AuthorizeResponse(OrmModel):
    url: str = Field(description="Pagina della banca dove autorizzare la lettura dei conti")


class CallbackRequest(ApiModel):
    """I parametri con cui la banca rimanda alla dashboard."""

    state: str = Field(min_length=1, max_length=4000)
    code: str | None = Field(default=None, max_length=4000)
    error: str | None = Field(default=None, max_length=200)
    error_description: str | None = Field(default=None, max_length=500)


class DisconnectResponse(OrmModel):
    deleted_transactions: int = Field(description="Movimenti eliminati (0 se tenuti)")


class CallbackResponse(OrmModel):
    source_id: int
    institution: str
    accounts: int = Field(description="Conti autorizzati")
    sync: SyncSummaryRead

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import case, exists, select
from sqlalchemy.dialects.postgresql import distinct_on

from app.api.deps import DbSession, apply_patch, get_or_404
from app.models import Account, AccountSource, Balance, Transaction
from app.schemas.accounts import (
    AccountCreate,
    AccountRead,
    AccountUpdate,
    SourceCreate,
    SourceRead,
    SourceUpdate,
)

router = APIRouter(tags=["accounts"])


# --- Sorgenti -------------------------------------------------------------------


@router.get("/sources", response_model=list[SourceRead])
def list_sources(session: DbSession) -> list[AccountSource]:
    return list(session.scalars(select(AccountSource).order_by(AccountSource.id)))


@router.post("/sources", response_model=SourceRead, status_code=status.HTTP_201_CREATED)
def create_source(payload: SourceCreate, session: DbSession) -> AccountSource:
    source = AccountSource(**payload.model_dump())
    session.add(source)
    session.commit()
    return source


@router.get("/sources/{source_id}", response_model=SourceRead)
def get_source(source_id: int, session: DbSession) -> AccountSource:
    return get_or_404(session, AccountSource, source_id, "Sorgente")


@router.patch("/sources/{source_id}", response_model=SourceRead)
def update_source(source_id: int, payload: SourceUpdate, session: DbSession) -> AccountSource:
    source = get_or_404(session, AccountSource, source_id, "Sorgente")
    apply_patch(source, payload, non_nullable=frozenset({"display_name", "status"}))
    session.commit()
    return source


# --- Conti ----------------------------------------------------------------------


def _with_balances(session: DbSession, accounts: list[Account]) -> list[AccountRead]:
    """Aggiunge a ogni conto l'ultimo saldo (una query per tutti).

    Si preferisce il disponibile: comprende i pagamenti ancora in sospeso, che le banche non
    mandano come movimenti, quindi è quello che vedi nell'app della banca. Senza disponibile
    (es. il broker) si usa il contabile.
    """
    latest = {
        row.account_id: row
        for row in session.scalars(
            select(Balance)
            .where(
                Balance.account_id.in_([a.id for a in accounts]),
                Balance.balance_type.in_(("booked", "available")),
            )
            .order_by(
                Balance.account_id,
                case((Balance.balance_type == "available", 0), else_=1),
                Balance.as_of.desc(),
            )
            .ext(distinct_on(Balance.account_id))
        )
    }
    result = []
    for account in accounts:
        item = AccountRead.model_validate(account)
        if balance := latest.get(account.id):
            item.balance, item.balance_as_of = balance.balance, balance.as_of
            item.balance_type = "available" if balance.balance_type == "available" else "booked"
        result.append(item)
    return result


@router.get("/accounts", response_model=list[AccountRead])
def list_accounts(session: DbSession, include_inactive: bool = False) -> list[AccountRead]:
    query = select(Account).order_by(Account.institution, Account.name)
    if not include_inactive:
        query = query.where(Account.is_active.is_(True))
    return _with_balances(session, list(session.scalars(query)))


@router.post("/accounts", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, session: DbSession) -> Account:
    get_or_404(session, AccountSource, payload.source_id, "Sorgente")
    account = Account(**payload.model_dump())
    session.add(account)
    session.commit()
    return account


@router.get("/accounts/{account_id}", response_model=AccountRead)
def get_account(account_id: int, session: DbSession) -> AccountRead:
    return _with_balances(session, [get_or_404(session, Account, account_id, "Conto")])[0]


@router.patch("/accounts/{account_id}", response_model=AccountRead)
def update_account(account_id: int, payload: AccountUpdate, session: DbSession) -> Account:
    account = get_or_404(session, Account, account_id, "Conto")
    apply_patch(
        account,
        payload,
        non_nullable=frozenset({"name", "is_active", "include_in_net_worth"}),
    )
    session.commit()
    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: int, session: DbSession) -> Response:
    """Elimina un conto solo se non ha movimenti (i saldi storici vanno via in cascata)."""
    account = get_or_404(session, Account, account_id, "Conto")
    if session.scalar(select(exists().where(Transaction.account_id == account.id))):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Il conto ha dei movimenti: disattivalo (is_active=false) invece di eliminarlo",
        )
    session.delete(account)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

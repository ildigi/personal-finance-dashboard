from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import get_db

DbSession = Annotated[Session, Depends(get_db)]


def get_or_404[M: Base](session: Session, model: type[M], pk: int, label: str) -> M:
    obj = session.get(model, pk)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} {pk} non trovato")
    return obj


def apply_patch(obj: Base, payload: BaseModel, *, non_nullable: frozenset[str]) -> None:
    """Applica solo i campi inviati; `null` è ammesso solo dove la colonna lo consente."""
    changes: dict[str, Any] = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is None and field in non_nullable:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"Il campo {field} non può essere vuoto"
            )
        setattr(obj, field, value)

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.messages import http_error
from app.db.base import Base
from app.db.session import get_db

DbSession = Annotated[Session, Depends(get_db)]


def get_or_404[M: Base](session: Session, model: type[M], pk: int) -> M:
    obj = session.get(model, pk)
    if obj is None:
        raise http_error(status.HTTP_404_NOT_FOUND, "not_found", id=pk)
    return obj


def apply_patch(obj: Base, payload: BaseModel, *, non_nullable: frozenset[str]) -> None:
    """Applica solo i campi inviati; `null` è ammesso solo dove la colonna lo consente."""
    changes: dict[str, Any] = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is None and field in non_nullable:
            raise http_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "field_required", field=field)
        setattr(obj, field, value)

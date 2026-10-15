from __future__ import annotations

from sqlalchemy import ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin, check_in
from app.models.enums import CategoryKind


class Category(IdMixin, TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (check_in("kind", CategoryKind),)

    name: Mapped[str] = mapped_column(unique=True)
    # Chiave stabile per seed e logica applicativa: il nome è modificabile, il codice no.
    code: Mapped[str | None] = mapped_column(unique=True)
    kind: Mapped[str]
    icon: Mapped[str | None]
    color: Mapped[str | None]
    sort_order: Mapped[int | None]
    is_system: Mapped[bool] = mapped_column(server_default=text("false"))
    # True per Investimenti: mai sommata alle spese reali (SPEC §11).
    excluded_from_spending: Mapped[bool] = mapped_column(server_default=text("false"))
    is_archived: Mapped[bool] = mapped_column(server_default=text("false"))

    subcategories: Mapped[list[Subcategory]] = relationship(
        back_populates="category",
        order_by=lambda: [Subcategory.sort_order.nulls_last(), Subcategory.name],
    )


class Subcategory(IdMixin, TimestampMixin, Base):
    __tablename__ = "subcategories"
    __table_args__ = (
        UniqueConstraint("category_id", "name"),
        UniqueConstraint("category_id", "code"),
        # Destinazione delle FK composte (subcategory_id, category_id) delle altre tabelle:
        # garantisce che una sottocategoria appartenga davvero alla categoria indicata.
        UniqueConstraint("id", "category_id"),
    )

    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    name: Mapped[str]
    code: Mapped[str | None]
    sort_order: Mapped[int | None]
    is_archived: Mapped[bool] = mapped_column(server_default=text("false"))

    category: Mapped[Category] = relationship(back_populates="subcategories")


class IncomeClassification(IdMixin, TimestampMixin, Base):
    """Tipologie di entrata (stipendio, bonifico ricevuto, rimborso, ...)."""

    __tablename__ = "income_classifications"

    code: Mapped[str] = mapped_column(unique=True)
    label: Mapped[str]
    is_system: Mapped[bool] = mapped_column(server_default=text("false"))

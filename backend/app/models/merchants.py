from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, ForeignKeyConstraint, Text, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin, check_in
from app.models.enums import MerchantOrigin


class Merchant(IdMixin, TimestampMixin, Base):
    __tablename__ = "merchants"
    __table_args__ = (
        ForeignKeyConstraint(
            ["default_subcategory_id", "default_category_id"],
            ["subcategories.id", "subcategories.category_id"],
            name="fk_merchants_default_subcategory_in_category",
        ),
        check_in("origin", MerchantOrigin),
    )

    name: Mapped[str]
    normalized_key: Mapped[str] = mapped_column(unique=True)
    # Pattern grezzi che identificano lo stesso merchant ("AMZN Mktp", "Amazon.it").
    aliases: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'::text[]"))
    default_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    default_subcategory_id: Mapped[int | None] = mapped_column(BigInteger)
    logo_url: Mapped[str | None]
    origin: Mapped[str] = mapped_column(server_default=MerchantOrigin.AUTO.value)

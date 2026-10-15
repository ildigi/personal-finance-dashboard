from __future__ import annotations

from datetime import datetime

from app.models.enums import SyncJob, SyncStatus
from app.schemas.common import OrmModel


class SyncJobRead(OrmModel):
    job: SyncJob
    status: SyncStatus
    fetched: int
    created: int
    updated: int
    details: dict[str, int]
    error: str | None


class SyncSummaryRead(OrmModel):
    source_id: int
    status: SyncStatus
    started_at: datetime
    finished_at: datetime
    jobs: list[SyncJobRead]


class Trading212Status(OrmModel):
    credentials_found: bool
    source_id: int | None


class SyncLogRead(OrmModel):
    id: int
    source_id: int
    job: SyncJob
    status: SyncStatus
    started_at: datetime
    finished_at: datetime | None
    items_fetched: int | None
    items_created: int | None
    items_updated: int | None
    error_message: str | None

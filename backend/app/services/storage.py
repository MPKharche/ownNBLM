"""Storage abstraction — LocalDisk (Phase 1) and S3 (Phase 3+)."""

from __future__ import annotations

import hashlib
import os
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import get_settings


class StorageBackend(ABC):
    @abstractmethod
    def save(self, org_id: str, filename: str, data: bytes) -> str:
        """Persist bytes; return storage key/path."""

    @abstractmethod
    def read(self, key: str) -> bytes:
        ...

    @abstractmethod
    def delete(self, key: str) -> None:
        ...

    @abstractmethod
    def signed_url(self, key: str, expires_seconds: int = 3600) -> str:
        ...


class LocalDiskBackend(StorageBackend):
    def __init__(self, base_path: str | None = None) -> None:
        settings = get_settings()
        self.base = Path(base_path or settings.storage_local_path)
        self.base.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        full = self.base / key
        full.parent.mkdir(parents=True, exist_ok=True)
        return full

    def save(self, org_id: str, filename: str, data: bytes) -> str:
        safe = hashlib.sha256(filename.encode()).hexdigest()[:12]
        ext = Path(filename).suffix or ".bin"
        key = f"{org_id}/{uuid.uuid4().hex}_{safe}{ext}"
        self._path(key).write_bytes(data)
        return key

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            p.unlink()

    def signed_url(self, key: str, expires_seconds: int = 3600) -> str:
        return f"/api/v1/files/download?key={key}&expires={expires_seconds}"


class S3Backend(StorageBackend):
    """S3-compatible backend (R2/MinIO) — requires boto3 at runtime."""

    def __init__(self) -> None:
        settings = get_settings()
        import boto3  # noqa: PLC0415

        self.bucket = settings.storage_s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.storage_s3_endpoint or None,
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )

    def save(self, org_id: str, filename: str, data: bytes) -> str:
        ext = Path(filename).suffix or ".bin"
        key = f"{org_id}/{uuid.uuid4().hex}{ext}"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)
        return key

    def read(self, key: str) -> bytes:
        obj = self.client.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def signed_url(self, key: str, expires_seconds: int = 3600) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_seconds,
        )


def get_storage() -> StorageBackend:
    settings = get_settings()
    if settings.storage_backend == "s3" and settings.storage_s3_bucket:
        return S3Backend()
    return LocalDiskBackend()

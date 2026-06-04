"""CLI: clean corpus and recover stuck ingest — python -m app.corpus_cleanup [--org ORG_ID]"""

from __future__ import annotations

import argparse

from app.core.database import SessionLocal
from app.models.org import Org
from app.services.source_lifecycle import reset_org_corpus


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset ownNBLM corpus / requeue stuck ingest")
    parser.add_argument("--org", help="Org UUID (default: all orgs)")
    parser.add_argument("--delete-all", action="store_true", help="Remove every source in org")
    parser.add_argument("--requeue-stuck", action="store_true", default=True)
    parser.add_argument("--no-requeue", action="store_true", help="Skip requeue step")
    args = parser.parse_args()
    requeue = args.requeue_stuck and not args.no_requeue

    with SessionLocal() as db:
        org_ids = [args.org] if args.org else [o.id for o in db.query(Org).all()]
        for org_id in org_ids:
            result = reset_org_corpus(
                db,
                org_id,
                delete_all=args.delete_all,
                requeue_stuck=requeue,
            )
            print(f"org={org_id} {result}")


if __name__ == "__main__":
    main()

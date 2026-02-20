# core/human_review.py — Human review queue (confidence_score < 0.75). Count for ZTAIP status.

from __future__ import annotations

from collections import deque

# In-memory queue; production would be a persistent store.
_human_review_queue: deque[dict] = deque()


def human_review_queue_count() -> int:
    return len(_human_review_queue)


def enqueue_for_review(item: dict) -> None:
    _human_review_queue.append(item)

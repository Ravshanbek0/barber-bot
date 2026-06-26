"""Best-effort activity recording.

`record(...)` is called from the middle of normal request flows (login, booking,
publishing …). It must never raise — a logging failure should not break a user
action — so every error is caught and logged, not propagated.
"""
import logging

log = logging.getLogger(__name__)


def record(actor=None, *, kind, description="", label="", tg_id=None, **meta):
    """Write one ActivityEvent. Silently no-ops on any failure.

    ``actor`` is a User (or None). ``label`` overrides the stored name snapshot
    (e.g. a walk-in's name, or a Telegram name when no account exists yet).
    Extra keyword args are stored as JSON ``meta`` for later drill-down.
    """
    try:
        from .models import ActivityEvent

        # AnonymousUser / unsaved instances aren't real actors.
        if actor is not None and not getattr(actor, "pk", None):
            actor = None

        actor_label = label
        if not actor_label and actor is not None:
            actor_label = actor.display_name
        if tg_id is None and actor is not None:
            tg_id = getattr(actor, "telegram_id", None)

        ActivityEvent.objects.create(
            actor=actor,
            actor_label=(actor_label or "—")[:160],
            actor_tg_id=tg_id,
            kind=kind,
            description=(description or "")[:255],
            meta=meta or {},
        )
    except Exception:  # pragma: no cover - logging must never break the flow
        log.warning("activity record failed (kind=%s)", kind, exc_info=True)

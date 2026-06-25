"""Telegram message text + inline-keyboard builders for bookings.

Shared by ``signals.py`` (initial outbound messages) and the bot's
``run_bot`` command (editing those messages after a button is tapped), so the
wording and button layout stay in one place.
"""
from django.utils import timezone

from .models import Booking

STATUS_EMOJI = {
    Booking.Status.PENDING: "🕐",
    Booking.Status.CONFIRMED: "✅",
    Booking.Status.IN_PROGRESS: "✂️",
    Booking.Status.COMPLETED: "🎉",
    Booking.Status.CANCELLED: "❌",
    Booking.Status.NO_SHOW: "⚠️",
}

# The master's next-step button(s) for each status. callback_data is
# "<action>:<booking_id>" (well under Telegram's 64-byte limit).
_MASTER_ACTIONS = {
    Booking.Status.PENDING: [
        ("✅ Tasdiqlash", "confirm"),
        ("🚫 Rad etish", "cancel"),
    ],
    Booking.Status.CONFIRMED: [
        ("✂️ Boshlash", "start"),
        ("❌ Bekor", "cancel"),
    ],
    Booking.Status.IN_PROGRESS: [
        ("🎉 Yakunlash", "done"),
    ],
}


def when_str(booking):
    return timezone.localtime(booking.start_at).strftime("%d.%m %H:%M")


def booking_text(booking, *, header="Bron"):
    """Master-facing booking card text."""
    service = booking.services_label()
    emoji = STATUS_EMOJI.get(booking.status, "•")
    overdue = "\n⏰ <b>Vaqti o'tdi</b>" if booking.is_overdue else ""
    return (
        f"{emoji} <b>{header}</b>\n"
        f"{booking.client_label()} · {service}\n"
        f"🗓 {when_str(booking)}\n"
        f"Holat: {booking.get_status_display()}{overdue}"
    )


def master_keyboard(booking):
    """Inline keyboard of next-step actions for the master, or None when the
    booking has reached a terminal state."""
    actions = _MASTER_ACTIONS.get(booking.status)
    if not actions:
        return None
    row = [{"text": label, "callback_data": f"{act}:{booking.id}"} for label, act in actions]
    return {"inline_keyboard": [row]}


def rating_keyboard(booking):
    """Inline 1–5 star keyboard for the client to rate a completed booking."""
    row = [
        {"text": f"{n}⭐", "callback_data": f"rate:{booking.id}:{n}"}
        for n in range(1, 6)
    ]
    return {"inline_keyboard": [row]}

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


# Client-facing status headline for each status — one evolving card per booking.
CLIENT_STATUS_HEADERS = {
    Booking.Status.PENDING: "🕐 So'rovingiz yuborildi",
    Booking.Status.CONFIRMED: "✅ Broningiz tasdiqlandi",
    Booking.Status.IN_PROGRESS: "✂️ Navbatingiz keldi",
    Booking.Status.COMPLETED: "🎉 Xizmat yakunlandi. Rahmat!",
    Booking.Status.CANCELLED: "❌ Broningiz bekor qilindi",
    Booking.Status.NO_SHOW: "⚠️ Siz belgilangan vaqtda kelmadingiz",
}


def when_str(booking):
    return timezone.localtime(booking.start_at).strftime("%d.%m %H:%M")


def client_card(booking):
    """Client-facing booking card. The same message is edited as the status
    changes, so the client sees one card per booking instead of many."""
    head = CLIENT_STATUS_HEADERS.get(booking.status, "Bron")
    extra = "\nUsta tasdiqlashini kuting." if booking.status == Booking.Status.PENDING else ""
    return (
        f"{head}\n"
        f"{booking.master.display_name} · {booking.services_label()}\n"
        f"🗓 {when_str(booking)}{extra}"
    )


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


def confirm_request_text(booking, minutes):
    """Pre-visit confirmation request sent 15 minutes before the start."""
    return (
        f"⏰ <b>Navbatingizgacha {minutes} daqiqa</b>\n"
        f"{booking.master.display_name} · {booking.services_label()}\n"
        f"🗓 {when_str(booking)}\n"
        f"Iltimos, kelishingizni tasdiqlang."
    )


def confirm_visit_keyboard(booking):
    """Single 'I'll come' button so the client confirms an upcoming visit."""
    return {"inline_keyboard": [[
        {"text": "✅ Kelaman, tasdiqlayman", "callback_data": f"visit_ok:{booking.id}"}
    ]]}

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from apps.accounts.telegram_bot import send_message

from .models import Booking
from .serializers import BookingSerializer
from .tg import booking_text, master_keyboard, rating_keyboard

# Status changes worth a Telegram message to the client.
CLIENT_STATUS_MESSAGES = {
    Booking.Status.CONFIRMED: "✅ Broningiz tasdiqlandi",
    Booking.Status.IN_PROGRESS: "✂️ Navbatingiz keldi",
    Booking.Status.COMPLETED: "🎉 Xizmat yakunlandi. Rahmat!",
    Booking.Status.CANCELLED: "❌ Broningiz bekor qilindi",
    Booking.Status.NO_SHOW: "⚠️ Siz belgilangan vaqtda kelmadingiz",
}


def _notify(group, payload):
    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(group, {"type": "notify", "payload": payload})


def _when(booking):
    return timezone.localtime(booking.start_at).strftime("%d.%m %H:%M")


def _already_reviewed(booking):
    from apps.masters.models import Review

    return Review.objects.filter(
        master_id=booking.master_id, author_id=booking.client_id
    ).exists()


@receiver(post_save, sender=Booking)
def booking_saved(sender, instance, created, **kwargs):
    """Realtime (WebSocket) + Telegram notifications for bookings.

    Deferred to ``on_commit`` so the booking's many-to-many ``services`` (set
    just after the row is created) are populated before we build the message —
    otherwise a multi-service booking would notify with only the first service.
    """
    transaction.on_commit(lambda: _dispatch_notifications(instance.pk, created))


def _dispatch_notifications(booking_pk, created):
    instance = (
        Booking.objects.filter(pk=booking_pk)
        .select_related("master__user", "client", "service")
        .first()
    )
    if instance is None:
        return
    data = BookingSerializer(instance).data
    event = "booking.created" if created else "booking.updated"

    # --- Realtime (in-app) ---
    _notify(f"notify_{instance.master.user_id}", {"event": event, "booking": data})
    _notify(f"notify_{instance.client_id}", {"event": event, "booking": data})

    # --- Telegram ---
    master_tg = getattr(instance.master.user, "telegram_id", None)
    client_tg = getattr(instance.client, "telegram_id", None)
    service = instance.services_label()
    when = _when(instance)

    if created:
        # Master gets the booking with inline action buttons (Tasdiqlash / Bekor).
        send_message(
            master_tg,
            booking_text(instance, header="Yangi bron"),
            reply_markup=master_keyboard(instance),
        )
        send_message(
            client_tg,
            f"🕐 <b>So'rovingiz yuborildi</b>\n{instance.master.display_name} · {service}\n"
            f"🗓 {when}\nUsta tasdiqlashini kuting.",
        )
    else:
        msg = CLIENT_STATUS_MESSAGES.get(instance.status)
        if msg:
            # Once a visit is completed, let the client rate it right in the chat
            # (unless they've already reviewed this master).
            markup = None
            if instance.status == Booking.Status.COMPLETED and not _already_reviewed(instance):
                markup = rating_keyboard(instance)
            send_message(
                client_tg,
                f"{msg}\n{instance.master.display_name} · {service}\n🗓 {when}",
                reply_markup=markup,
            )

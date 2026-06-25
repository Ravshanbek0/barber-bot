from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.telegram_bot import edit_message_text, send_message

from .models import Booking
from .serializers import BookingSerializer
from .tg import booking_text, client_card, master_keyboard, rating_keyboard


def _notify(group, payload):
    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(group, {"type": "notify", "payload": payload})


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

    if created and instance.client_id:
        # Master gets the booking with inline action buttons (Tasdiqlash / Bekor).
        # Skipped for walk-ins: the master added it themselves and there is no
        # client account to notify.
        master_msg = send_message(
            master_tg,
            booking_text(instance, header="Yangi bron"),
            reply_markup=master_keyboard(instance),
        )
        client_msg = send_message(client_tg, client_card(instance))
        # Remember both cards so later status changes (from the app or the bot)
        # edit them in place — one card per booking, no duplicate messages.
        # update() avoids re-firing this signal.
        fields = {}
        if master_msg:
            fields["master_message_id"] = master_msg
        if client_msg:
            fields["client_message_id"] = client_msg
        if fields:
            Booking.objects.filter(pk=instance.pk).update(**fields)
    else:
        # Status changed — update the client's single card in place. On
        # completion add the rating buttons (unless already reviewed).
        if client_tg and instance.client_id:
            markup = None
            if instance.status == Booking.Status.COMPLETED and not _already_reviewed(instance):
                markup = rating_keyboard(instance)
            if instance.client_message_id:
                edit_message_text(
                    client_tg, instance.client_message_id, client_card(instance), reply_markup=markup
                )
            else:
                # Older booking with no stored card — fall back to a new message.
                send_message(client_tg, client_card(instance), reply_markup=markup)
        # Keep the master's card in sync too — buttons reflect the new status
        # (and clear on terminal states). Runs server-side, so it works even
        # when the change came from the dashboard.
        if master_tg and instance.master_message_id:
            edit_message_text(
                master_tg,
                instance.master_message_id,
                booking_text(instance),
                reply_markup=master_keyboard(instance),
            )

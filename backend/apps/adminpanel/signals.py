"""Turn booking saves into activity-feed entries.

A separate receiver (not the notification one in apps.bookings.signals) so the
admin feed stays decoupled from the Telegram/WebSocket side. ``.update(...)``
calls don't fire post_save, so message-id writes won't create noise — only real
creates and status changes land here.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.bookings.models import Booking

from .events import record


@receiver(post_save, sender=Booking)
def booking_activity(sender, instance, created, **kwargs):
    services = instance.services_label()
    if created:
        record(
            actor=instance.client,
            kind="booking_created",
            label=instance.client_label(),
            description=f"{instance.master.display_name} — {services}",
            booking_id=instance.pk,
            master=instance.master.handle,
            status=instance.status,
        )
    else:
        record(
            actor=instance.client,
            kind="booking_status",
            label=instance.client_label(),
            description=f"{instance.master.display_name}: {instance.get_status_display()}",
            booking_id=instance.pk,
            master=instance.master.handle,
            status=instance.status,
        )

"""Seed the activity feed from data that already exists.

Logins/`/start` presses weren't tracked before this app, but accounts, masters,
bookings and reviews carry timestamps — so we can reconstruct a real history the
owner can see immediately instead of an empty feed. Best-effort: any failure is
swallowed so a deploy migration never breaks on odd legacy rows.
"""
from django.db import migrations


def backfill(apps, schema_editor):
    ActivityEvent = apps.get_model("adminpanel", "ActivityEvent")
    User = apps.get_model("accounts", "User")
    MasterProfile = apps.get_model("masters", "MasterProfile")
    Booking = apps.get_model("bookings", "Booking")
    Review = apps.get_model("masters", "Review")

    def name_of(u):
        full = f"{u.first_name} {u.last_name}".strip()
        return full or u.phone

    rows = []
    try:
        for u in User.objects.all():
            rows.append(ActivityEvent(
                actor_id=u.id, actor_label=name_of(u), actor_tg_id=u.telegram_id,
                kind="joined", description="Ro'yxatdan o'tgan (tarixiy)",
                meta={}, created_at=u.created_at,
            ))
        for m in MasterProfile.objects.select_related("user").all():
            rows.append(ActivityEvent(
                actor_id=m.user_id, actor_label=m.display_name,
                actor_tg_id=getattr(m.user, "telegram_id", None),
                kind="became_master", description=f"@{m.handle} (tarixiy)",
                meta={}, created_at=m.created_at,
            ))
        for b in Booking.objects.select_related("master", "client").all():
            if b.client_id:
                label = name_of(b.client)
            else:
                label = b.walk_in_name or "Mijoz"
            rows.append(ActivityEvent(
                actor_id=b.client_id, actor_label=label, actor_tg_id=None,
                kind="booking_created",
                description=f"{b.master.display_name} (tarixiy)",
                meta={"booking_id": b.id, "status": b.status}, created_at=b.created_at,
            ))
        for r in Review.objects.select_related("master", "author").all():
            rows.append(ActivityEvent(
                actor_id=r.author_id, actor_label=name_of(r.author), actor_tg_id=None,
                kind="review_created",
                description=f"{r.master.display_name} — {r.rating}⭐ (tarixiy)",
                meta={}, created_at=r.created_at,
            ))
        ActivityEvent.objects.bulk_create(rows, batch_size=500)
    except Exception:
        pass


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("adminpanel", "0001_initial"),
        ("accounts", "0004_remove_user_avatar"),
        ("masters", "0002_remove_masterprofile_cover_delete_portfolioitem"),
        ("bookings", "0005_booking_client_message_id"),
    ]

    operations = [migrations.RunPython(backfill, noop)]

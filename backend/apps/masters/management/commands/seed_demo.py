from datetime import time

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.masters.models import Discount, MasterProfile, Service, WorkingHours

DEMO = [
    {
        "phone": "+998901112233",
        "handle": "akmal_barber",
        "name": "Akmal Karimov",
        "city": "Toshkent",
        "address": "Chilonzor 9-kvartal",
        "bio": "10 yillik tajriba. Fade va klassik soch turmaklari.",
        "services": [("Soch olish", 80000, 40), ("Soqol", 40000, 20), ("Fade + soqol", 110000, 55)],
    },
    {
        "phone": "+998901112244",
        "handle": "doston_cuts",
        "name": "Doston Yusupov",
        "city": "Toshkent",
        "address": "Yunusobod 4-mavze",
        "bio": "Zamonaviy uslublar, bolalar uchun ham.",
        "services": [("Soch olish", 70000, 35), ("Bolalar", 50000, 30)],
    },
    {
        "phone": "+998901112255",
        "handle": "sardor_style",
        "name": "Sardor Aliyev",
        "city": "Samarqand",
        "address": "Registon ko'chasi 12",
        "bio": "Premium barbershop xizmatlari.",
        "services": [("Soch olish", 90000, 45), ("Qirqish + uljom", 130000, 60)],
    },
]


class Command(BaseCommand):
    help = "Seed demo masters, services, hours and discounts."

    def handle(self, *args, **options):
        for d in DEMO:
            user, _ = User.objects.get_or_create(
                phone=d["phone"],
                defaults={"is_master": True, "role": User.Role.MASTER, "is_phone_verified": True},
            )
            user.is_master = True
            user.role = User.Role.MASTER
            user.first_name = d["name"].split()[0]
            user.last_name = d["name"].split()[-1]
            user.save()

            profile, _ = MasterProfile.objects.update_or_create(
                user=user,
                defaults={
                    "handle": d["handle"],
                    "display_name": d["name"],
                    "city": d["city"],
                    "address": d["address"],
                    "bio": d["bio"],
                    "avg_rating": 4.8,
                    "reviews_count": 24,
                },
            )
            profile.services.all().delete()
            for name, price, dur in d["services"]:
                Service.objects.create(
                    master=profile, name=name, price=price, duration_min=dur
                )
            for wd in range(6):  # Mon-Sat
                WorkingHours.objects.update_or_create(
                    master=profile,
                    weekday=wd,
                    defaults={"start_time": time(9, 0), "end_time": time(20, 0)},
                )
            Discount.objects.get_or_create(
                master=profile,
                title="Ochilish chegirmasi",
                defaults={"percent": 15, "description": "Birinchi tashrif uchun 15%"},
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(DEMO)} masters."))

# Barber — usta bron qilish platformasi (Telegram Mini App)

Bitta interfeysda ham mijoz, ham usta foydalanadigan bron platformasi.
Backend — **Django + DRF + Channels**, frontend — **React (Vite) + CSS**.
Ilova **Telegram Mini App** sifatida ishlaydi: dizayn mobil-birinchi, premium
"barbershop" uslubi (to'q charcoal + iliq brass urg'u), pastki tab-navigatsiya.

## Asosiy g'oya

- **Telegram orqali auth:** ilova Telegram ichida ochilganda foydalanuvchi
  `initData` orqali avtomatik aniqlanadi (backendda HMAC bilan tekshiriladi),
  alohida login/parol yo'q. Brauzerda lokal ishlash uchun **dev-login** zaxira.
- **Mehmon birinchi (guest-first):** foydalanuvchi ustalarni erkin qidiradi va
  ko'radi; bron/chat Telegram identifikatori bilan darhol ishlaydi.
- **Usta bo'lish** — profil yaratilganda akkaunt avtomatik ustaga aylanadi.
- **Ustalar uchun qiymat:** navbatni boshqarish, kunlik kirim, ish vaqtini
  e'lon qilish, chegirma, real-time bildirishnomalar — qo'ng'iroqlarni kamaytiradi.
- **Mijozlar uchun:** sana + ish vaqtidan avtomatik generatsiya qilinadigan vaqt
  slotlari bilan onlayn bron va bron eslatmalari.

## Struktura

```
backend/    Django REST API + WebSocket (Channels)
  config/         settings, urls, asgi (Channels routing)
  apps/accounts/  telefon asosidagi User + OTP (SMS/Telegram) auth, JWT
  apps/masters/   master profili (Instagram-uslub), xizmat, ish vaqti, chegirma, sharh
  apps/bookings/  bron + navbat + signal orqali real-time bildirishnoma
  apps/chat/      1:1 real-time chat (WebSocket, JWT middleware)
frontend/   React + Vite SPA
  src/pages/      Search, MasterDetail, MyBookings, Chat, Dashboard
  src/components/ Header, AuthModal (OTP), MasterCard, dashboard panellari
  src/store/      auth (zustand), authModal (register-on-action gate)
  src/styles/     theme.css — dizayn tizimi (yorug'/zamonaviy, 3 desktop breakpoint)
```

## Backend ishga tushirish

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_demo          # 3 ta demo usta yaratadi
python manage.py createsuperuser    # admin uchun (ixtiyoriy)
# Channels (WebSocket) bilan ishlatish uchun ASGI server:
daphne -b 0.0.0.0 -p 8000 config.asgi:application
# yoki oddiy dev (WebSocket ham ishlaydi, Daphne INSTALLED_APPS da):
python manage.py runserver
```

**Redis:** real-time uchun `REDIS_URL` (default `redis://127.0.0.1:6379/0`).
Redis bo'lmasa dev rejimida `.env` ga `USE_INMEMORY_CHANNELS=True` qo'ying.

**OTP dev rejimi:** SMS/Telegram provider sozlanmagan bo'lsa, kod konsolga
chiqariladi (`[DEV SMS] -> +998... : ...`). Provider integratsiyasi
`apps/accounts/services.py` da (`send_sms`, `send_telegram`).

## Frontend ishga tushirish

```bash
cd frontend
npm install
cp .env.example .env
npm run dev        # http://localhost:5173 (API ga proxy qiladi)
```

## Asosiy oqim (demo)

1. Bosh sahifada usta qidiring → karta ustiga bosing.
2. Xizmat va vaqt tanlab **Bron qilish** → OTP modal ochiladi (konsoldagi kodni kiriting).
3. Tasdiqlangach bron yaratiladi, **Bronlarim** sahifasida ko'rinadi.
4. Usta paneliga kirish: **Usta bo'lish** → profil yarating → **Navbat** jadvali
   real-time yangilanadi, statusni o'zgartiring, ish vaqti/chegirma sozlang.

## API (qisqacha)

| Endpoint | Tavsif |
|---|---|
| `POST /api/v1/auth/telegram/webapp/` | **Asosiy auth** — Telegram Mini App `initData` ni tekshirib JWT beradi |
| `POST /api/v1/auth/dev-login/` | Lokal dev uchun (faqat DEBUG) — Telegramsiz mijoz/usta sifatida kirish |
| `POST /api/v1/auth/otp/request/` | OTP yuborish (sms/telegram) — zaxira oqim |
| `POST /api/v1/auth/otp/verify/` | Kodni tasdiqlash + JWT — zaxira oqim |
| `POST /api/v1/auth/telegram/` | Telegram Login Widget (web sayt uchun) |
| `GET  /api/v1/masters/` | Qidiruv (`?search=&city=`) |
| `GET  /api/v1/masters/{handle}/` | Usta profili |
| `POST /api/v1/bookings/` | Bron yaratish |
| `GET  /api/v1/bookings/queue/{handle}/` | Bugungi navbat |
| `ws   /ws/notifications/?token=` | Master/mijoz real-time bildirishnomalar |
| `ws   /ws/chat/{conversation_id}/?token=` | Real-time chat |

## Telegram Mini App sifatida ulash

1. [@BotFather](https://t.me/BotFather) da bot yarating → tokenni `backend/.env`
   dagi `TELEGRAM_BOT_TOKEN` ga qo'ying (token bo'lsa, `initData` imzosi
   majburiy tekshiriladi; bo'lmasa dev rejimida imzo tekshirilmaydi).
2. Frontendni internetga chiqaring (build qilib hosting yoki dev uchun
   `cloudflared` / `ngrok` orqali HTTPS tunnel).
3. `backend/.env` ga `WEBAPP_URL` (frontendning HTTPS manzili) ni qo'ying va
   botni ishga tushiring:
   ```bash
   python manage.py run_bot
   ```
   Bot `/start` ga **"Ilovani ochish"** tugmasi bilan javob beradi va menyu
   tugmasini ham sozlaydi — bosilganda Mini App ochiladi va foydalanuvchi
   avtomatik tanilib kiradi (hech narsa so'ralmaydi).

> **Kirish oqimi:**
> 1. Ilova ochilishi bilan foydalanuvchi **mehmon (guest)** sifatida saqlanadi —
>    hech narsa so'ralmaydi, ustalarni ko'radi/qidiradi.
> 2. **Bron qilganda** bir martalik telefon **tasdiqlanadi** — tanlov:
>    *Telegram orqali raqam ulashish* yoki *SMS kod* (dev'da kod ilovada ko'rinadi).
> 3. **Usta bo'lish** — Profil → "Usta bo'lish" (telefon tasdiqlash + bir bosish,
>    ism Telegramdan). Profil **qoralama** bo'ladi; dashboard'da majburiy maydonlar
>    (joylashuv geolokatsiya orqali, ≥1 xizmat, ish vaqti) to'lib **"E'lon qilish"**
>    bosilgach qidiruvda ko'rinadi. Avatar va portfolio — ixtiyoriy.
>
> **Joylashuv:** ustaning manzili qo'lda emas — geolokatsiya orqali aniqlanadi
> (faqat "mo'ljal" matni qo'lda). Qidiruvda **"📍 Eng yaqin"** foydalanuvchining
> joylashuviga eng yaqin ustalarni masofa bo'yicha topadi.
>
> **Bron tasdiq:** bron avval *"Tasdiq kutilmoqda"* holatida bo'ladi; usta
> tasdiqlagandan keyin mijozga xabar boradi. Har bron ichiga kirib (Bronlarim →
> bron) to'liq ma'lumot, usta esa mijoz raqamini ko'radi.

> Lokalda Telegramsiz: shunchaki `npm run dev` — avtomatik mijoz sifatida kirasiz.

## Bron eslatmalari (scheduler)

Mijozlarga bron vaqtidan oldin Telegram eslatma yuboriladi:

```bash
python manage.py send_reminders            # keyingi 60 daqiqa ichidagilar
python manage.py send_reminders --minutes 30
```

Buni har 5 daqiqada ishga tushiring:
- **Linux/Mac (cron):** `*/5 * * * * cd /path/backend && .venv/bin/python manage.py send_reminders`
- **Windows (Task Scheduler):** har 5 daqiqada `backend\.venv\Scripts\python.exe manage.py send_reminders`

Har bron faqat bir marta eslatiladi (`reminder_sent` flag — idempotent).

## Bildirishnomalar

- **Real-time (ilova ichida):** WebSocket (`/ws/notifications/`) — usta panelida yangi
  bron darhol ko'rinadi.
- **Telegram:** yangi bron → ustaga; bron tasdiq/bekor/yakun → mijozga
  (`apps/accounts/telegram_bot.py`, `apps/bookings/signals.py`). Dev rejimida
  konsolga `[DEV TG MSG]` chiqadi; ishlab chiqarishda `TELEGRAM_BOT_TOKEN` kerak.

> Eslatma: Telegram yuborishlar hozir sinxron (signal/management command ichida).
> Yuqori yuklamada Celery/RQ kabi fon vazifasiga ko'chiring.

## Bajarilgan keyingi bosqichlar

- ✅ Telegram Mini App auth + bron eslatmalari + Telegram bildirishnomalar.
- ✅ Rasm yuklash: avatar (`/auth/me/`), muqova va portfolio (`/portfolio/`,
  `/masters/{handle}/` — Instagram-uslub grid).
- ✅ Sharh qoldirish (yulduz + izoh, yakunlangan bron uchun).

## Qoladigan bosqichlar

- Xarita integratsiyasi (manzil koordinatalari modeldа mavjud).
- To'lov integratsiyasi.
- Telegram yuborishlarni Celery/RQ fon vazifasiga ko'chirish.

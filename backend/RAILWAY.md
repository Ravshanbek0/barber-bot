# Backendni Railway'ga deploy qilish

Bu loyiha Railway uchun tayyor (`railway.json`, `.python-version`). Quyidagilar
bir martalik sozlash. Tartibni buzmang.

> Eslatma: Railway "free" — cheklangan sinov krediti ($5). Test uchun yetadi;
> doimiy ish uchun keyin arzon rejaga o'tasiz.
>
> Yangi baza bo'sh bo'ladi — eski ma'lumotlar (suspended Render Postgres'da)
> ko'chmaydi. Avval bo'sh boshlaysiz.

## 1. Loyiha yaratish
1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
   → `Ravshanbek0/barber-bot` ni tanlang.
2. Servis ochilgach: **Settings → Source → Root Directory** = `backend`.
   (Shunda `backend/railway.json` o'qiladi.)

## 2. PostgreSQL qo'shish
1. Loyiha ichida **New → Database → Add PostgreSQL**.
2. Backend servisi → **Variables** → `DATABASE_URL` ni qo'shing va qiymatini
   `${{Postgres.DATABASE_URL}}` referensiga ulang.

## 3. Environment variables (backend servisida)
**Variables** bo'limiga quyidagilarni qo'shing:

| Nomi | Qiymati |
|------|---------|
| `SECRET_KEY` | uzun tasodifiy satr (50+ belgi) |
| `DEBUG` | `False` |
| `USE_INMEMORY_CHANNELS` | `True` |
| `DB_SSL_REQUIRE` | `False` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ALLOWED_HOSTS` | `.up.railway.app` |
| `WEBAPP_URL` | `https://barber-bot-tau.vercel.app` |
| `FRONTEND_ORIGIN` | `https://barber-bot-tau.vercel.app` (admin saytni ham vergul bilan qo'shing) |
| `CSRF_TRUSTED_ORIGINS` | `https://*.up.railway.app,https://barber-bot-tau.vercel.app` |
| `TELEGRAM_BOT_TOKEN` | bot tokeningiz (@BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | tasodifiy maxfiy satr |
| `OTP_DEV_PRINT` | `True` |

## 4. Ommaviy domen olish
1. Backend servisi → **Settings → Networking → Generate Domain**.
2. Sizga `https://<nom>.up.railway.app` beradi. Bu manzilni nusxalang.
3. Yana **Variables** ga qo'shing:
   | `BACKEND_URL` | `https://<nom>.up.railway.app` |
   (Bu bot webhook uchun kerak — boot paytida avtomatik ulanadi.)
4. Servisni qayta deploy qiling (**Deploy**). Boot paytida `migrate`,
   `collectstatic` va `set_webhook` avtomatik ishlaydi — bot ulanadi.

> **Healthcheck:** `railway.json` da `healthcheckPath: /healthz` belgilangan.
> Bu yengil endpoint DBga tegmaydi va `healthcheck.railway.app` host bilan ham
> `200 ok` qaytaradi (`ALLOWED_HOSTS` ga avtomatik qo'shiladi). Agar baribir
> "Healthcheck failure" chiqsa — bu deyarli har doim boot crash'i: **Deploy
> Logs** ni oching va `migrate`/DB ulanish xatosini qidiring (ko'pincha
> `DB_SSL_REQUIRE=False` qo'yilmagani yoki `DATABASE_URL` ulanmagani).

## 5. Admin akkaunt yaratish
Backend servisi → **⋮ → Shell** (yoki lokalda `railway run`):
```bash
python manage.py create_admin --phone +99890XXXXXXX --password "KuchliParol"
```

## 6. Frontendni yangi backendga ulash (Vercel)
Eski Render manzili o'rniga Railway manzilini ko'rsating:
1. **Vercel → asosiy ilova loyihasi → Settings → Environment Variables**:
   - `VITE_API_BASE` = `https://<nom>.up.railway.app/api/v1`
   - `VITE_WS_BASE` = `wss://<nom>.up.railway.app`
2. **Redeploy** bosing.
3. Admin sayt loyihasida ham `VITE_API_BASE` ni shu Railway manziliga qo'ying.

## 7. Tekshirish
- Telegram botga **/start** → javob berishi kerak.
- Mini App'ni oching → ishlashi kerak.
- Admin sayt → telefon+parol bilan kiring.

## Bot webhook (qo'lda kerak bo'lsa)
Boot'da avtomatik ulanadi. Qo'lda qayta ulash uchun Shell'da:
```bash
python manage.py set_webhook            # ulash
python manage.py set_webhook --delete   # o'chirish
```

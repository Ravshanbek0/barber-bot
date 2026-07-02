# Barber — Admin panel

Alohida, faqat egasi (staff) kiradigan boshqaruv paneli. Foydalanuvchilar,
ustalar, bronlar va **jonli faoliyat** (kim kirdi, /start bosdi, bron qildi,
usta bo'ldi …) ni ko'rsatadi.

## Lokal ishga tushirish

```bash
# 1) Backend (boshqa terminalda)
cd ../backend
python manage.py migrate
python manage.py create_admin --phone +998901234567 --password "Strong#Pass"
python manage.py runserver 8000

# 2) Admin panel
cd ../admin
npm install
npm run dev        # http://localhost:5174  (/api -> localhost:8000 ga proxy)
```

Login: yuqorida `create_admin` da bergan telefon + parol.

## Production (Railway backend)

Admin paneli ham Vercel'ga alohida loyiha sifatida chiqariladi (asosiy Mini
App'dan mustaqil — bir xil GitHub repo, lekin **Root Directory = `admin`**).

1. **Env**: Vercel'da `VITE_API_BASE=https://<railway-domen>.up.railway.app/api/v1`.
2. **Admin akkaunt**: Railway → backend servis → **Console** tab'da
   `python manage.py create_admin --phone <tel> --password <parol>`.
3. **CORS**: Railway'da `FRONTEND_ORIGIN` ga admin panel domenini qo'shing
   (vergul bilan): `https://<asosiy>.vercel.app,https://<admin>.vercel.app`.

## Xavfsizlik

Hamma `/api/v1/admin/*` endpoint'lari `is_staff` JWT talab qiladi —
oddiy foydalanuvchilar (Telegram orqali kirganlar) bu ma'lumotni ko'ra olmaydi.
`create_admin` ni qayta ishga tushirish parolni yangilaydi (reset sifatida).

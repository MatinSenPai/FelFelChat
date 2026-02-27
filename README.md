<div dir="rtl">

# 💬 فل‌فل‌چت

**فل‌فل‌چت** یک پیام‌رسان بلادرنگ مدرن و امن است که با Next.js، Socket.IO و MongoDB ساخته شده. این پروژه برای استقرار روی سرور خودتان (self-hosted) طراحی شده و از ویژگی‌هایی مانند تماس صوتی، رمزنگاری، چندزبانگی و پنل مدیریت پیشرفته برخوردار است.

---

## ✨ ویژگی‌ها

- **پیام‌رسانی بلادرنگ** — چت گروهی و خصوصی با Socket.IO
- **تماس صوتی** — تماس یک‌به‌یک از طریق WebRTC
- **رمزنگاری هوشمند** — پیام‌های حساس با `hushCrypto` رمزگذاری می‌شوند
- **آپلود فایل** — ارسال تصویر، ویدیو، PDF و سایر فایل‌ها
- **استیکر و GIF** — پشتیبانی از استیکر و GIF اختصاصی
- **احراز هویت امن** — JWT در کوکی، هشینگ رمز عبور با bcrypt
- **پنل مدیریت** — مدیریت کاربران، اتاق‌ها، تماس‌ها، پشتیبان‌گیری و ذخیره‌سازی
- **چندزبانگی** — پشتیبانی از فارسی و انگلیسی (RTL/LTR)
- **لاگ حسابرسی** — ثبت تمامی رویدادهای مهم سیستم
- **پشتیبان‌گیری امن** — پشتیبان‌گیری قابل‌ تأیید با امضای رمزنگاری
- **نرخ‌محدودی** — محافظت در برابر سوءاستفاده از API
- **مانیتورینگ** — یکپارچه‌سازی با Sentry

---

## 🏗️ معماری و تکنولوژی‌ها

| بخش            | تکنولوژی                         |
| -------------- | -------------------------------- |
| فریم‌ورک       | Next.js 16 (App Router)          |
| بک‌اند بلادرنگ | Socket.IO 4                      |
| پایگاه داده    | MongoDB (از طریق Prisma ORM)     |
| احراز هویت     | JWT + bcryptjs                   |
| استایل         | Tailwind CSS 4 + Vanilla CSS     |
| فونت           | Vazirmatn (فارسی) + Sora (لاتین) |
| تماس صوتی      | WebRTC + TURN                    |
| مانیتورینگ     | Sentry                           |
| زبان           | TypeScript                       |

---

## 📁 ساختار پروژه

```
FelFelChat/
├── src/
│   ├── app/                  # صفحات و API Routes
│   │   ├── page.tsx          # صفحه اصلی (چت)
│   │   ├── login/            # صفحه ورود
│   │   ├── signup/           # صفحه ثبت‌نام
│   │   ├── profile/          # صفحه پروفایل
│   │   ├── admin/            # پنل مدیریت
│   │   └── api/              # REST API Routes
│   ├── components/           # کامپوننت‌های React
│   │   ├── ChatView.tsx      # رابط اصلی چت
│   │   ├── Sidebar.tsx       # نوار کناری (لیست اتاق‌ها)
│   │   ├── VoiceCall.tsx     # کامپوننت تماس صوتی
│   │   ├── AppIcon.tsx       # آیکون‌های اپ
│   │   ├── EmojiStickerPicker.tsx  # انتخاب‌گر ایموجی/استیکر
│   │   ├── GroupMembersModal.tsx   # مدیریت اعضای گروه
│   │   ├── ImagePreviewModal.tsx   # پیش‌نمایش تصویر
│   │   ├── UserProfileModal.tsx    # پروفایل کاربر
│   │   └── providers/        # کانتکست‌های React
│   ├── lib/                  # ابزارها و سرویس‌ها
│   │   ├── hushCrypto.ts     # رمزنگاری
│   │   ├── i18n.ts           # چندزبانگی (FA/EN)
│   │   ├── jwt.ts            # مدیریت توکن
│   │   ├── prisma.ts         # اتصال پایگاه داده
│   │   ├── routeAuth.ts      # احراز هویت روت‌ها
│   │   ├── rateLimit.ts      # نرخ‌محدودی
│   │   ├── auditLog.ts       # لاگ حسابرسی
│   │   ├── backupIntegrity.ts # یکپارچگی پشتیبان
│   │   ├── imageCompression.ts # فشرده‌سازی تصویر
│   │   ├── monitoring.ts     # Sentry
│   │   ├── logger.ts         # لاگر
│   │   └── socket.ts         # Socket.IO Client
│   └── assets/branding/      # لوگو و برندینگ
├── prisma/
│   ├── schema.prisma         # مدل‌های پایگاه داده
│   ├── seed.ts               # داده‌های اولیه
│   └── migrations/           # تاریخچه مایگریشن‌ها
├── server.mjs                # سرور Node.js سفارشی
├── docs/
│   └── OPERATIONS.md         # راهنمای عملیات و نگهداری
├── install.sh                # اسکریپت نصب و مدیریت (لینوکس)
└── .env.example              # نمونه متغیرهای محیطی
```

---

## ⚙️ پیش‌نیازها

- **Node.js** نسخه ۲۰ به بالا
- **MongoDB** نسخه ۸ به بالا + **Replica Set** فعال
- **npm**

---

## 🚀 راه‌اندازی سریع (لینوکس)

با یک دستور، همه چیز نصب و راه‌اندازی می‌شود:

```bash
curl -sL https://raw.githubusercontent.com/MatinSenPai/FelFelChat/main/install.sh | bash
```

بعد از نصب، با دستور `felfel` اپ را مدیریت کنید.

---

## 🛠️ راه‌اندازی دستی

### ۱. کلون پروژه

```bash
git clone https://github.com/MatinSenPai/FelFelChat.git
cd FelFelChat
```

### ۲. نصب وابستگی‌ها

```bash
npm install
```

### ۳. تنظیم متغیرهای محیطی

```bash
cp .env.example .env
```

فایل `.env` را ویرایش کنید:

```env
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:3000

JWT_SECRET=<یک رشته تصادفی بلند>
DATABASE_URL=mongodb://127.0.0.1:27017/felfelchat?replicaSet=rs0&directConnection=true

UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE_MB=20

BACKUP_DIR=./backups
BACKUP_SIGNING_KEY=<یک رشته تصادفی بلند>

AUDIT_LOG_DIR=./logs

# اختیاری
SENTRY_DSN=
NEXT_PUBLIC_WEBRTC_TURN_URLS=
NEXT_PUBLIC_WEBRTC_TURN_USERNAME=
NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL=
```

### ۴. راه‌اندازی MongoDB با Replica Set

```bash
# در مسیر /etc/mongod.conf اضافه کنید:
replication:
  replSetName: "rs0"

# سرویس را ری‌استارت کنید
sudo systemctl restart mongod

# Replica Set را راه‌اندازی کنید
mongosh --eval "rs.initiate()"
```

### ۵. اجرای Migrations

```bash
npm run db:migrate
```

### ۶. اجرای برنامه

```bash
# محیط توسعه
npm run dev

# محیط پروداکشن
npm run build
npm start
```

اپ در آدرس `http://localhost:3000` در دسترس است.

---

## 📜 دستورات مفید

| دستور                | کاربرد                         |
| -------------------- | ------------------------------ |
| `npm run dev`        | اجرا در محیط توسعه             |
| `npm run build`      | ساخت نسخه پروداکشن             |
| `npm start`          | اجرا در محیط پروداکشن          |
| `npm run lint`       | بررسی کیفیت کد                 |
| `npm run db:migrate` | اجرای مایگریشن‌های پایگاه داده |
| `npm run db:seed`    | بارگذاری داده‌های اولیه        |
| `npm run db:studio`  | باز کردن Prisma Studio         |

---

## 🔐 متغیرهای محیطی

| متغیر                          | اجباری | توضیح                        |
| ------------------------------ | ------ | ---------------------------- |
| `JWT_SECRET`                   | ✅     | کلید رمزنگاری توکن‌ها        |
| `DATABASE_URL`                 | ✅     | آدرس اتصال MongoDB           |
| `APP_ORIGIN`                   | ✅     | آدرس عمومی اپ                |
| `BACKUP_SIGNING_KEY`           | ✅     | کلید امضای فایل‌های پشتیبان  |
| `PORT`                         | ❌     | پورت سرور (پیش‌فرض: ۳۰۰۰)    |
| `UPLOAD_DIR`                   | ❌     | مسیر ذخیره فایل‌های آپلودشده |
| `UPLOAD_MAX_SIZE_MB`           | ❌     | حداکثر سایز فایل (MB)        |
| `SENTRY_DSN`                   | ❌     | DSN مانیتورینگ Sentry        |
| `NEXT_PUBLIC_WEBRTC_TURN_URLS` | ❌     | آدرس‌های TURN Server         |

---

## 🏥 بررسی سلامت سرور

| Endpoint          | توضیح           |
| ----------------- | --------------- |
| `GET /api/health` | وضعیت کلی سرور  |
| `GET /api/ready`  | آمادگی سرویس‌ها |

---

## 📄 لایسنس

این پروژه تحت لایسنس MIT منتشر شده است.

</div>

---

---

<div dir="ltr">

# 💬 FelFelChat

**FelFelChat** is a modern, secure, self-hosted real-time messaging application built with Next.js, Socket.IO, and MongoDB. It features real-time chat, WebRTC voice calls, end-to-end encryption, multilingual support (Farsi/English), and a powerful admin panel.

---

## ✨ Features

- **Real-time Messaging** — Group and private chat powered by Socket.IO
- **Voice Calls** — One-on-one calls via WebRTC
- **Message Encryption** — Sensitive messages encrypted with `hushCrypto`
- **File Uploads** — Send images, videos, PDFs, and more
- **Stickers & GIFs** — Custom sticker and GIF support
- **Secure Auth** — JWT cookies + bcrypt password hashing
- **Admin Panel** — Manage users, rooms, calls, backups, and storage
- **Multilingual** — Full Farsi and English support with RTL/LTR layouts
- **Audit Logging** — All critical events are logged
- **Signed Backups** — Cryptographically signed backup/restore
- **Rate Limiting** — API abuse protection
- **Monitoring** — Sentry integration

---

## 🏗️ Tech Stack

| Layer       | Technology                         |
| ----------- | ---------------------------------- |
| Framework   | Next.js 16 (App Router)            |
| Real-time   | Socket.IO 4                        |
| Database    | MongoDB via Prisma ORM             |
| Auth        | JWT + bcryptjs                     |
| Styling     | Tailwind CSS 4 + Vanilla CSS       |
| Fonts       | Vazirmatn (Persian) + Sora (Latin) |
| Voice Calls | WebRTC + TURN                      |
| Monitoring  | Sentry                             |
| Language    | TypeScript                         |

---

## 📁 Project Structure

```
FelFelChat/
├── src/
│   ├── app/                  # Pages and API Routes
│   │   ├── page.tsx          # Main chat page
│   │   ├── login/            # Login page
│   │   ├── signup/           # Sign-up page
│   │   ├── profile/          # User profile page
│   │   ├── admin/            # Admin panel
│   │   └── api/              # REST API routes
│   ├── components/           # React components
│   │   ├── ChatView.tsx      # Main chat interface
│   │   ├── Sidebar.tsx       # Room list sidebar
│   │   ├── VoiceCall.tsx     # Voice call UI
│   │   ├── AppIcon.tsx       # App icons
│   │   ├── EmojiStickerPicker.tsx  # Emoji/sticker picker
│   │   ├── GroupMembersModal.tsx   # Group member management
│   │   ├── ImagePreviewModal.tsx   # Image preview
│   │   ├── UserProfileModal.tsx    # User profile modal
│   │   └── providers/        # React contexts
│   ├── lib/                  # Utilities and services
│   │   ├── hushCrypto.ts     # Encryption
│   │   ├── i18n.ts           # Internationalization (FA/EN)
│   │   ├── jwt.ts            # Token management
│   │   ├── prisma.ts         # Database client
│   │   ├── routeAuth.ts      # Route authentication
│   │   ├── rateLimit.ts      # Rate limiting
│   │   ├── auditLog.ts       # Audit logging
│   │   ├── backupIntegrity.ts # Backup verification
│   │   ├── imageCompression.ts # Client-side image compression
│   │   ├── monitoring.ts     # Sentry init
│   │   ├── logger.ts         # Structured logger
│   │   └── socket.ts         # Socket.IO client helper
│   └── assets/branding/      # Logo and branding assets
├── prisma/
│   ├── schema.prisma         # Database models
│   ├── seed.ts               # Seed data
│   └── migrations/           # Migration history
├── server.mjs                # Custom Node.js server (Next.js + Socket.IO)
├── docs/
│   └── OPERATIONS.md         # Operations runbook
├── install.sh                # Linux one-command installer & manager
└── .env.example              # Environment variable template
```

---

## ⚙️ Prerequisites

- **Node.js** v20 or later
- **MongoDB** v8 or later with a **Replica Set** configured
- **npm**

---

## 🚀 Quick Install (Linux)

Install and configure everything with a single command:

```bash
curl -sL https://raw.githubusercontent.com/MatinSenPai/FelFelChat/main/install.sh | bash
```

After installation, use the `felfel` command to manage your server.

---

## 🛠️ Manual Setup

### 1. Clone the repository

```bash
git clone https://github.com/MatinSenPai/FelFelChat.git
cd FelFelChat
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:3000

JWT_SECRET=<long-random-secret>
DATABASE_URL=mongodb://127.0.0.1:27017/felfelchat?replicaSet=rs0&directConnection=true

UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE_MB=20

BACKUP_DIR=./backups
BACKUP_SIGNING_KEY=<long-random-signing-key>

AUDIT_LOG_DIR=./logs

# Optional
SENTRY_DSN=
NEXT_PUBLIC_WEBRTC_TURN_URLS=
NEXT_PUBLIC_WEBRTC_TURN_USERNAME=
NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL=
```

### 4. Set up MongoDB with Replica Set

MongoDB Replica Set is required for Prisma change streams. Add the following to `/etc/mongod.conf`:

```yaml
replication:
  replSetName: "rs0"
```

Then restart and initialize:

```bash
sudo systemctl restart mongod
mongosh --eval "rs.initiate()"
```

### 5. Run database migrations

```bash
npm run db:migrate
```

### 6. Start the app

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The app is available at `http://localhost:3000`.

---

## 📜 Scripts

| Command              | Description               |
| -------------------- | ------------------------- |
| `npm run dev`        | Start in development mode |
| `npm run build`      | Build for production      |
| `npm start`          | Start in production mode  |
| `npm run lint`       | Lint the codebase         |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed`    | Seed initial data         |
| `npm run db:studio`  | Open Prisma Studio        |

---

## 🔐 Environment Variables

| Variable                             | Required | Description                      |
| ------------------------------------ | -------- | -------------------------------- |
| `JWT_SECRET`                         | ✅       | Secret key for signing JWTs      |
| `DATABASE_URL`                       | ✅       | MongoDB connection string        |
| `APP_ORIGIN`                         | ✅       | Public app URL (for CORS)        |
| `BACKUP_SIGNING_KEY`                 | ✅       | Key for signing backup files     |
| `PORT`                               | ❌       | Server port (default: 3000)      |
| `UPLOAD_DIR`                         | ❌       | Directory for uploaded files     |
| `UPLOAD_MAX_SIZE_MB`                 | ❌       | Max upload size in MB            |
| `SENTRY_DSN`                         | ❌       | Sentry monitoring DSN            |
| `NEXT_PUBLIC_WEBRTC_TURN_URLS`       | ❌       | TURN server URLs for voice calls |
| `NEXT_PUBLIC_WEBRTC_TURN_USERNAME`   | ❌       | TURN server username             |
| `NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL` | ❌       | TURN server credential           |

---

## 🏥 Health Checks

| Endpoint          | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `GET /api/health` | Overall server status                                               |
| `GET /api/ready`  | Service readiness check (returns 503 if dependencies are unhealthy) |

---

## 🛡️ Security

- All routes are protected by JWT authentication middleware
- Passwords hashed with **bcrypt**
- Uploaded files are served from a sandboxed directory with path-traversal protection
- Content Security Policy, X-Frame-Options, and other security headers applied on every response
- `JWT_SECRET` and `BACKUP_SIGNING_KEY` should be rotated regularly (see `docs/OPERATIONS.md`)

---

## 📄 License

This project is licensed under the MIT License.

</div>

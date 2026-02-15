# نام پروژه: FelFel Chat! (فلفل چت!)

> یک وب‌اپ چت سبک و بهینه، طراحی‌شده برای شرایط فیلترینگ ایران — وقتی ارتباط با اینترنت خارج قطعه و فقط سرور داخلی داری.

---

## ۱. Setup پروژه و وابستگی‌ها

```bash
npx create-next-app@latest felfel-chat --typescript --app
```

**وابستگی‌های اصلی:**
```bash
npm i prisma @prisma/client socket.io socket.io-client jsonwebtoken bcryptjs multer tailwindcss shadcn/ui @tanstack/react-query simple-peer
```

**Dev deps:**
```bash
npm i -D pm2
```

**Prisma init:**
```bash
npx prisma init --datasource-provider sqlite
```

- Tailwind و shadcn setup برای UI سریع (کامپوننت‌های آماده مثل ChatBubble, Input, Button).
- `simple-peer` برای تماس صوتی WebRTC (سبک‌تر از PeerJS).

---

## ۲. Prisma Schema (دیتابیس)

استفاده از **SQLite** (فایل تک: `prisma/dev.db`). بدون نقش ادمین — فقط **SUPERADMIN** و **USER**.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL") // file:./dev.db
}

model User {
  id           String    @id @default(uuid())
  username     String    @unique
  displayName  String?
  password     String    // hashed with bcrypt
  isSuperAdmin Boolean   @default(false) // فقط یک نفر — manual set در seed
  isBanned     Boolean   @default(false)
  createdAt    DateTime  @default(now())
  lastSeen     DateTime  @default(now())
  messages     Message[]
  rooms        Room[]    @relation("RoomMembers")
  callLogs     CallLog[] @relation("Caller")
  callsReceived CallLog[] @relation("Callee")
}

model Room {
  id        String    @id @default(uuid())
  name      String
  type      RoomType  @default(GROUP)
  createdBy String    // userId — فقط SUPERADMIN
  createdAt DateTime  @default(now())
  messages  Message[]
  members   User[]    @relation("RoomMembers")
}

enum RoomType {
  CHANNEL  // فقط سوپرادمین بسازه — پیام یک‌طرفه
  GROUP    // فقط سوپرادمین بسازه — چت گروهی
  PRIVATE  // چت خصوصی بین دو کاربر — همه می‌تونن بسازن
}

model Message {
  id        String   @id @default(uuid())
  text      String?
  fileUrl   String?  // for uploads
  fileSize  Int?     // سایز فایل به بایت — برای مدیریت فضا
  userId    String
  roomId    String
  createdAt DateTime @default(now())
  readBy    String   @default("") // comma-separated userIds
  user      User     @relation(fields: [userId], references: [id])
  room      Room     @relation(fields: [roomId], references: [id])
}

model CallLog {
  id         String    @id @default(uuid())
  callerId   String
  calleeId   String
  startedAt  DateTime  @default(now())
  endedAt    DateTime?
  duration   Int?      // ثانیه
  status     CallStatus @default(RINGING)
  caller     User      @relation("Caller", fields: [callerId], references: [id])
  callee     User      @relation("Callee", fields: [calleeId], references: [id])
}

enum CallStatus {
  RINGING    // در حال زنگ خوردن
  ACTIVE     // تماس برقرار
  ENDED      // تمام شده عادی
  MISSED     // بی‌پاسخ
  REJECTED   // رد شده
  TERMINATED // قطع شده توسط سوپرادمین
}

model BackupLog {
  id        String   @id @default(uuid())
  filename  String   // نام فایل بکاپ
  size      Int      // سایز بکاپ به بایت
  createdAt DateTime @default(now())
  note      String?  // یادداشت اختیاری سوپرادمین
}
```

**Migration:**
```bash
npx prisma migrate dev --name init
```

**Seed اولیه:** یک superadmin با `isSuperAdmin=true` در seed ایجاد کن.

**FTS5 برای جستجوی سریع:**
```sql
-- در migration manual اضافه کن:
CREATE VIRTUAL TABLE message_fts USING fts5(text, content='Message', content_rowid='rowid');
```

---

## ۳. Auth Logic (JWT-based)

سبک و بدون next-auth — خودمون می‌نویسیم.

- **Signup:** `/app/api/auth/signup/route.ts`
  - چک username unique
  - Hash password با bcrypt (salt rounds: 10)
  - همه کاربران جدید عادی هستن (isSuperAdmin=false)
  - ثبت‌نام سوپرادمین **فقط از طریق seed یا مستقیم در DB**

- **Login:** `/app/api/auth/login/route.ts`
  - Compare hash
  - چک `isBanned` — اگر بن شده، ورود نده
  - Generate JWT: `{ id, username, isSuperAdmin }`

- **JWT:**
  - Secret در `.env`
  - Expire: `7d` (هفته‌ای — چون سرور لوکاله و logout دستی داریم)
  - استفاده از `jsonwebtoken` برای sign/verify

- **Session:**
  - ذخیره token در httpOnly cookie (امن‌تر از localStorage)
  - Verify در هر request با middleware

---

## ۴. سیستم نقش‌ها (فقط دو سطح)

### نقش‌ها:
| نقش | توضیح |
|------|--------|
| **SUPERADMIN** | یک نفر — مدیر کل سیستم. فقط از طریق DB تنظیم می‌شه. |
| **USER** | کاربر عادی — چت، تماس صوتی، ارسال فایل. |

### جدول دسترسی‌ها:

| عملیات | USER | SUPERADMIN |
|--------|------|------------|
| ارسال پیام در گروه/کانال | ✅ (گروه) / ❌ (کانال) | ✅ |
| ساخت چت خصوصی | ✅ | ✅ |
| ساخت گروه/کانال | ❌ | ✅ |
| حذف گروه/کانال | ❌ | ✅ |
| اضافه/حذف عضو از گروه | ❌ | ✅ |
| تماس صوتی (۱ به ۱) | ✅ | ✅ |
| بن/آنبن کاربر | ❌ | ✅ |
| مشاهده لیست همه کاربران | ❌ | ✅ |
| مدیریت فضا و بکاپ | ❌ | ✅ |
| مانیتور تماس‌ها | ❌ | ✅ |
| قطع تماس فعال | ❌ | ✅ |
| حذف پیام دیگران | ❌ | ✅ |

### Middleware:
```typescript
// middleware.ts
import { verifyJwt } from '@/lib/jwt';

export function middleware(req) {
  const token = req.cookies.get('token')?.value;
  const user = verifyJwt(token);

  if (!user) return redirect('/login');

  // مسیرهای ادمین فقط برای سوپرادمین
  if (req.nextUrl.pathname.startsWith('/admin') && !user.isSuperAdmin) {
    return new Response('Forbidden', { status: 403 });
  }
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
```

---

## ۵. Realtime Logic با Socket.io

سرور Socket.io جدا از Next.js (برای performance بهتر):

```typescript
// server/socket.ts
import { Server } from 'socket.io';
import { verifyJwt } from '@/lib/jwt';

const activeCall: { callerId: string; calleeId: string; logId: string } | null = null;

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    pingInterval: 10000, // heartbeat هر ۱۰ ثانیه
    pingTimeout: 5000,
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const user = verifyJwt(token);
    if (!user) return next(new Error('Auth error'));
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    // Join room‌های کاربر
    socket.join(`user:${socket.user.id}`);
    // Update lastSeen
    updateLastSeen(socket.user.id);
    // Broadcast online status
    io.emit('user:online', socket.user.id);

    // --- پیام‌ها ---
    socket.on('message:send', async (data) => {
      // validate: اگر room نوع CHANNEL هست، فقط سوپرادمین بتونه بفرسته
      const room = await getRoom(data.roomId);
      if (room.type === 'CHANNEL' && !socket.user.isSuperAdmin) {
        return socket.emit('error', 'فقط سوپرادمین در کانال پیام می‌فرسته');
      }
      const msg = await prisma.message.create({ data: { ...data, userId: socket.user.id } });
      io.to(data.roomId).emit('message:new', msg);
    });

    socket.on('message:typing', (roomId) => {
      socket.to(roomId).emit('message:typing', socket.user.username);
    });

    socket.on('message:read', async ({ messageId, roomId }) => {
      // update readBy
      await markAsRead(messageId, socket.user.id);
      io.to(roomId).emit('message:read', { messageId, userId: socket.user.id });
    });

    // --- تماس صوتی (فقط ۱ تماس در لحظه) ---
    socket.on('call:initiate', async ({ calleeId }) => {
      if (activeCall) {
        return socket.emit('call:error', 'یک تماس فعال وجود داره. صبر کن تا تموم بشه.');
      }
      const log = await prisma.callLog.create({
        data: { callerId: socket.user.id, calleeId, status: 'RINGING' }
      });
      activeCall = { callerId: socket.user.id, calleeId, logId: log.id };
      io.to(`user:${calleeId}`).emit('call:incoming', {
        callerId: socket.user.id,
        callerName: socket.user.username,
        logId: log.id
      });
      // اطلاع به سوپرادمین برای مانیتورینگ
      io.to('superadmin').emit('call:started', {
        logId: log.id,
        caller: socket.user.username,
        calleeId
      });
    });

    socket.on('call:accept', async ({ logId }) => {
      await prisma.callLog.update({ where: { id: logId }, data: { status: 'ACTIVE' } });
      if (activeCall && activeCall.logId === logId) {
        io.to(`user:${activeCall.callerId}`).emit('call:accepted', { logId });
      }
    });

    socket.on('call:end', async ({ logId }) => {
      await endCall(logId, 'ENDED');
    });

    socket.on('call:reject', async ({ logId }) => {
      await endCall(logId, 'REJECTED');
    });

    // WebRTC signaling
    socket.on('call:signal', ({ targetUserId, signal }) => {
      io.to(`user:${targetUserId}`).emit('call:signal', {
        fromUserId: socket.user.id,
        signal
      });
    });

    // --- قطع تماس توسط سوپرادمین ---
    socket.on('call:terminate', async ({ logId }) => {
      if (!socket.user.isSuperAdmin) return socket.emit('error', 'دسترسی نداری');
      await endCall(logId, 'TERMINATED');
    });

    // سوپرادمین join اتاق مانیتورینگ
    if (socket.user.isSuperAdmin) {
      socket.join('superadmin');
    }

    socket.on('disconnect', () => {
      updateLastSeen(socket.user.id);
      io.emit('user:offline', socket.user.id);
      // اگر کاربر disconnect شده تماس فعال داشته، تماس رو تموم کن
      if (activeCall && (activeCall.callerId === socket.user.id || activeCall.calleeId === socket.user.id)) {
        endCall(activeCall.logId, 'ENDED');
      }
    });
  });

  // Helper: پایان تماس
  async function endCall(logId: string, status: string) {
    const log = await prisma.callLog.update({
      where: { id: logId },
      data: { status, endedAt: new Date(), duration: /* calculate */ }
    });
    if (activeCall && activeCall.logId === logId) {
      io.to(`user:${activeCall.callerId}`).emit('call:ended', { logId, status });
      io.to(`user:${activeCall.calleeId}`).emit('call:ended', { logId, status });
      io.to('superadmin').emit('call:ended', { logId, status });
      activeCall = null;
    }
  }
}
```

**نکات مهم تماس صوتی:**
- فقط **تلفنی** (صوتی) — ویدیو نداریم.
- حداکثر **۱ تماس فعال** در کل سیستم در لحظه (محدودیت منابع سرور ایران).
- از `simple-peer` با `{ initiator: true/false, trickle: true, stream: audioStream }` استفاده کن.
- فقط audio stream: `navigator.mediaDevices.getUserMedia({ audio: true, video: false })`.
- Signaling از طریق Socket.io.
- سوپرادمین می‌تونه تماس فعال رو ببینه و قطع کنه.

---

## ۶. Search Logic (سریع و بهینه)

```typescript
// جستجوی full-text با FTS5
const results = await prisma.$queryRaw`
  SELECT m.*, u.username
  FROM message_fts f
  JOIN Message m ON m.rowid = f.rowid
  JOIN User u ON u.id = m.userId
  WHERE message_fts MATCH ${query}
  ORDER BY rank
  LIMIT 50;
`;
```

- **UI:** Input search با debounce (300ms) + React Query برای caching.
- **Query syntax:** ساپورت `word1 OR word2`، `"exact phrase"`، `word*` (prefix).
- **Index:** روی `Message.text` و `User.username`.

---

## ۷. پنل سوپرادمین (جامع)

> مسیر: `/admin` — فقط سوپرادمین دسترسی داره.

### ۷.۱ داشبورد (`/admin`)
- تعداد کاربران آنلاین (realtime از socket)
- تعداد کل کاربران / پیام‌ها / اتاق‌ها
- حجم کل فضای مصرفی (DB + uploads)
- وضعیت تماس فعال (اگر هست: کی به کی زنگ زده، مدت زمان)
- نمودار ساده مصرف فضا در طول زمان

### ۷.۲ مدیریت کاربران (`/admin/users`)
- لیست همه کاربران با جستجو
- بن/آنبن کاربر
- مشاهده آخرین فعالیت (lastSeen)
- حذف کاربر (soft delete یا hard delete)

### ۷.۳ مدیریت اتاق‌ها (`/admin/rooms`)
- ساخت گروه/کانال جدید
- حذف اتاق
- اضافه/حذف عضو از اتاق
- مشاهده تعداد پیام‌ها و اعضای هر اتاق

### ۷.۴ مدیریت پیام‌ها (`/admin/messages`)
- لاگ پیام‌ها با فیلتر (بر اساس اتاق، کاربر، تاریخ)
- جستجوی پیشرفته (FTS5)
- حذف تکی یا دسته‌ای پیام‌ها
- **پاکسازی پیام‌های قدیمی** (مثلاً پیام‌های بیشتر از ۳۰ روز قبل)

### ۷.۵ مانیتور تماس‌ها (`/admin/calls`)
- لیست تاریخچه تماس‌ها (کی → کی, مدت, وضعیت)
- مشاهده تماس فعال فعلی (realtime)
- **دکمه قطع تماس فعال** — فوری تماس رو terminate می‌کنه
- فیلتر بر اساس تاریخ و کاربر

### ۷.۶ مدیریت فضا (`/admin/storage`)

> **بحرانی برای سرورهای ایران** — فضای دیسک محدوده.

#### نمای کلی فضا:
```typescript
// API: /api/admin/storage/stats
interface StorageStats {
  totalDisk: number;       // کل فضای دیسک (بایت)
  usedDisk: number;        // فضای مصرف‌شده کل
  freeDisk: number;        // فضای خالی
  dbSize: number;          // حجم فایل دیتابیس
  uploadsSize: number;     // حجم پوشه uploads
  uploadsCount: number;    // تعداد فایل‌ها
  backupsSize: number;     // حجم بکاپ‌ها
}
```

#### عملیات مدیریت فضا:
- **مشاهده حجم بر حسب اتاق:** چه اتاقی بیشترین فضا رو اشغال کرده
- **پاکسازی فایل‌های آپلودی:** حذف فایل‌های قدیمی (با تعیین بازه زمانی)
- **پاکسازی پیام‌های قدیمی:** حذف با تعیین تعداد روز
- **خالی کردن یک اتاق:** حذف همه پیام‌ها و فایل‌های یک اتاق خاص
- **فشرده‌سازی دیتابیس:** اجرای `VACUUM` روی SQLite بعد از حذف‌ها

```typescript
// API: /api/admin/storage/cleanup
export async function POST(req) {
  const { action, params } = await req.json();

  switch (action) {
    case 'delete-old-messages':
      // حذف پیام‌های قدیمی‌تر از params.days روز
      const cutoff = new Date(Date.now() - params.days * 86400000);
      // اول فایل‌های مرتبط رو حذف کن
      const oldMessages = await prisma.message.findMany({
        where: { createdAt: { lt: cutoff }, fileUrl: { not: null } }
      });
      for (const msg of oldMessages) {
        await deleteFile(msg.fileUrl); // حذف فیزیکی فایل
      }
      await prisma.message.deleteMany({ where: { createdAt: { lt: cutoff } } });
      break;

    case 'delete-room-content':
      // خالی کردن محتوای یک اتاق
      await deleteRoomFiles(params.roomId);
      await prisma.message.deleteMany({ where: { roomId: params.roomId } });
      break;

    case 'delete-old-uploads':
      // حذف فایل‌های آپلودی قدیمی
      await deleteOldUploads(params.days);
      break;

    case 'vacuum':
      // فشرده‌سازی دیتابیس
      await prisma.$queryRaw`VACUUM;`;
      break;
  }
}
```

#### هشدار فضا:
- وقتی فضای خالی کمتر از **۵۰۰ مگابایت** بشه → هشدار زرد در داشبورد
- وقتی کمتر از **۱۰۰ مگابایت** بشه → هشدار قرمز + محدودیت آپلود فایل‌های جدید
- **محدودیت سایز آپلود:** پیش‌فرض ۵ مگابایت (قابل تغییر توسط سوپرادمین)

### ۷.۷ بکاپ و ریستور (`/admin/backup`)

> **ضروری** — سرور ممکنه نیاز به مهاجرت یا بازنشانی داشته باشه.

#### بکاپ (Backup):
```typescript
// API: /api/admin/backup/create
export async function POST(req) {
  const { note } = await req.json();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `/opt/chat/backups`;
  const filename = `felfel-backup-${timestamp}.tar.gz`;

  // ۱. کپی دیتابیس SQLite (safe copy)
  await prisma.$queryRaw`VACUUM INTO '${backupDir}/db-${timestamp}.sqlite'`;

  // ۲. بسته‌بندی DB + uploads
  await exec(`tar -czf ${backupDir}/${filename} -C ${backupDir} db-${timestamp}.sqlite -C /opt/chat uploads/`);

  // ۳. حذف فایل DB موقت
  await unlink(`${backupDir}/db-${timestamp}.sqlite`);

  // ۴. لاگ بکاپ
  const stat = await fileStat(`${backupDir}/${filename}`);
  await prisma.backupLog.create({
    data: { filename, size: stat.size, note }
  });

  return Response.json({ success: true, filename, size: stat.size });
}
```

#### ریستور (Restore):
```typescript
// API: /api/admin/backup/restore
export async function POST(req) {
  const { filename } = await req.json();
  const backupDir = `/opt/chat/backups`;

  // ۱. تأیید وجود فایل بکاپ
  if (!existsSync(`${backupDir}/${filename}`)) throw new Error('بکاپ پیدا نشد');

  // ۲. بکاپ از وضعیت فعلی قبل از ریستور (safety)
  await createAutoBackup('pre-restore');

  // ۳. disconnect همه کاربران
  io.emit('system:maintenance', 'سیستم در حال بازیابی...');
  io.disconnectSockets();

  // ۴. استخراج بکاپ
  await exec(`tar -xzf ${backupDir}/${filename} -C /tmp/restore/`);

  // ۵. جایگزینی DB و uploads
  await copyFile('/tmp/restore/db-*.sqlite', 'prisma/dev.db');
  await exec(`rsync -a /tmp/restore/uploads/ /opt/chat/uploads/`);

  // ۶. ری‌استارت سرویس
  await exec('pm2 restart chat');
}
```

#### مدیریت بکاپ‌ها:
- لیست بکاپ‌ها با حجم و تاریخ
- دانلود بکاپ از سرور (برای نگهداری خارج سرور)
- حذف بکاپ‌های قدیمی (مدیریت فضا)
- **بکاپ خودکار:** اسکریپت cron هر ۲۴ ساعت + حذف بکاپ‌های بیشتر از ۷ روز

```bash
# crontab -e
0 3 * * * /opt/chat/scripts/auto-backup.sh
```

```bash
#!/bin/bash
# scripts/auto-backup.sh
BACKUP_DIR="/opt/chat/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="auto-backup-${TIMESTAMP}.tar.gz"

# بکاپ
sqlite3 prisma/dev.db "VACUUM INTO '${BACKUP_DIR}/db-temp.sqlite'"
tar -czf "${BACKUP_DIR}/${FILENAME}" -C "${BACKUP_DIR}" db-temp.sqlite -C /opt/chat uploads/
rm "${BACKUP_DIR}/db-temp.sqlite"

# حذف بکاپ‌های قدیمی‌تر از ۷ روز
find "${BACKUP_DIR}" -name "auto-backup-*.tar.gz" -mtime +7 -delete

echo "Backup done: ${FILENAME}"
```

---

## ۸. امکانات اضافی

### ارسال فایل/عکس:
- Multer در API route، ذخیره در `./uploads/`
- لینک در `message.fileUrl` + سایز در `message.fileSize`
- **محدودیت حجم:** پیش‌فرض ۵ مگابایت (قابل تغییر توسط سوپرادمین)
- فشرده‌سازی تصاویر قبل از ذخیره (با `sharp` — ریسایز به max 1200px width)

### تماس صوتی (خلاصه):
- فقط **صوتی** — بدون ویدیو
- حداکثر **۱ تماس فعال** در کل سرور
- WebRTC با `simple-peer` + signaling از Socket.io
- سوپرادمین: مانیتور (کی → کی، مدت) + قطع تماس
- لاگ همه تماس‌ها در `CallLog`
- اگر کاربر disconnect بشه، تماس خودکار تمام می‌شه

### نوتیفیکیشن:
- Sound notification برای پیام جدید (فایل صوتی کوتاه)
- اگر browser از Notification API پشتیبانی کنه: push notification در background
- هیچ وابستگی به سرویس خارجی نداره (همه لوکال)

### وضعیت آنلاین:
- Heartbeat با Socket.io (هر ۱۰ ثانیه ping)
- `lastSeen` update در disconnect
- نمایش وضعیت: 🟢 آنلاین / 🔴 آخرین بازدید: ۵ دقیقه پیش

---

## ۹. محدودیت‌ها و بهینه‌سازی برای سرور ایران

> سرورهای داخلی ایران معمولاً منابع محدودی دارن: RAM کم، CPU ضعیف، دیسک کم.

### بهینه‌سازی‌ها:
- **SQLite** به جای PostgreSQL/MySQL — فوق‌العاده سبک و بدون daemon
- **Socket.io** با `pingInterval: 10000` — فشار شبکه‌ای کمتر
- **۱ تماس فعال** در لحظه — جلوگیری از overload
- **محدودیت آپلود** — جلوگیری از پر شدن دیسک
- **VACUUM خودکار** بعد از cleanup — بازپس‌گیری فضا
- **Pagination** در همه لیست‌ها — مصرف RAM کمتر
- **فشرده‌سازی عکس‌ها** — ذخیره فایل‌های کوچک‌تر
- **بکاپ خودکار** با حذف قدیمی‌ها — فضای بکاپ مدیریت‌شده
- **هشدار فضا** — سوپرادمین قبل از بحران خبردار می‌شه

### محدودیت‌های پیشنهادی (قابل تغییر در تنظیمات):
| پارامتر | مقدار پیش‌فرض |
|---------|--------------|
| حداکثر سایز آپلود | ۵ مگابایت |
| حداکثر تعداد تماس هم‌زمان | ۱ |
| مدت نگهداری بکاپ خودکار | ۷ روز |
| حداکثر طول پیام | ۲۰۰۰ کاراکتر |
| هشدار فضای خالی | < ۵۰۰ مگابایت |
| بحران فضای خالی | < ۱۰۰ مگابایت |

---

## ۱۰. Deployment و نصب

### Build:
```bash
npm run build
```

### Start:
```bash
pm2 start npm --name felfel-chat -- run start
```

### اسکریپت نصب خودکار (سرور ایران):
```bash
#!/bin/bash
# install.sh — نصب FelFel Chat روی سرور تازه

set -e

echo "🌶️ نصب FelFel Chat..."

# پیش‌نیازها
apt update && apt install -y git nodejs npm sqlite3

# دانلود پروژه
git clone <REPO_URL> /opt/felfel-chat
cd /opt/felfel-chat

# نصب وابستگی‌ها
npm install

# ساخت پوشه‌ها
mkdir -p uploads backups scripts

# تنظیمات
cp .env.example .env
# ویرایش .env: DATABASE_URL, JWT_SECRET

# دیتابیس
npx prisma migrate deploy

# Seed سوپرادمین
npx prisma db seed

# Build
npm run build

# PM2
npm i -g pm2
pm2 start npm --name felfel-chat -- run start
pm2 save
pm2 startup

# Cron بکاپ خودکار
cp scripts/auto-backup.sh /opt/felfel-chat/scripts/
chmod +x /opt/felfel-chat/scripts/auto-backup.sh
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/felfel-chat/scripts/auto-backup.sh") | crontab -

echo "✅ FelFel Chat نصب شد! پورت: 3000"
echo "⚠️ Nginx + HTTPS رو خودت تنظیم کن."
```

### امنیت:
- HTTPS با Nginx + Certbot (حتی برای سرور داخلی — self-signed هم اوکیه)
- Rate limit در middleware (جلوگیری از brute force)
- Helmet headers در Next.js
- فقط سوپرادمین به `/admin` و `/api/admin/*` دسترسی داره
- JWT httpOnly cookie (نه localStorage)

---

## ساختار پوشه‌ها:
```
felfel-chat/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (chat)/
│   │   ├── layout.tsx          # sidebar + main area
│   │   ├── page.tsx            # لیست اتاق‌ها
│   │   └── [roomId]/page.tsx   # صفحه چت
│   ├── admin/
│   │   ├── page.tsx            # داشبورد
│   │   ├── users/page.tsx
│   │   ├── rooms/page.tsx
│   │   ├── messages/page.tsx
│   │   ├── calls/page.tsx      # مانیتور تماس‌ها
│   │   ├── storage/page.tsx    # مدیریت فضا
│   │   └── backup/page.tsx     # بکاپ و ریستور
│   └── api/
│       ├── auth/
│       │   ├── signup/route.ts
│       │   └── login/route.ts
│       ├── rooms/route.ts
│       ├── messages/route.ts
│       ├── search/route.ts
│       ├── upload/route.ts
│       └── admin/
│           ├── users/route.ts
│           ├── rooms/route.ts
│           ├── storage/
│           │   ├── stats/route.ts
│           │   └── cleanup/route.ts
│           ├── calls/route.ts
│           └── backup/
│               ├── create/route.ts
│               ├── restore/route.ts
│               └── list/route.ts
├── server/
│   └── socket.ts               # Socket.io server
├── lib/
│   ├── jwt.ts
│   ├── prisma.ts
│   └── storage.ts              # utility‌های مدیریت فضا
├── components/
│   ├── ChatBubble.tsx
│   ├── RoomList.tsx
│   ├── VoiceCall.tsx           # کامپوننت تماس صوتی
│   └── AdminDashboard.tsx
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── uploads/                     # فایل‌های آپلودی
├── backups/                     # بکاپ‌ها
├── scripts/
│   ├── auto-backup.sh
│   └── install.sh
├── middleware.ts
├── .env
└── package.json
```
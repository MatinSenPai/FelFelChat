# FelFel Chat

FelFel Chat is a real-time chat application built with Next.js, Prisma (SQLite), and Socket.IO.

## Stack
- Next.js (App Router) + TypeScript
- Prisma + SQLite
- Socket.IO (custom `server.mjs`)
- JWT auth (HTTP-only cookie)

## Features
- Private chats, groups, channels
- Realtime messaging (text/file/sticker/gif)
- Realtime voice-call signaling
- Admin panel (users/rooms/messages/storage/backup/settings/audit)
- Profile management (avatar + bio)
- Bilingual UI (FA/EN)

## Security and Production Hardening
Implemented in this project:
- Path traversal protection for uploaded files
- Internal admin authorization checks (not proxy-only)
- Socket membership checks for room events
- Rate limiting (auth/upload/admin)
- CSRF same-origin enforcement for unsafe authenticated methods
- Secure cookie in production
- Required `JWT_SECRET` (no insecure fallback)
- Upload validation (MIME + extension + content signature)
- Backup signature verification before restore (HMAC + SHA256)
- Structured logging + optional Sentry integration
- Health/readiness endpoints:
  - `GET /api/health`
  - `GET /api/ready`

## Production Environment Variables
Minimum required:
- `JWT_SECRET`
- `APP_ORIGIN`
- `BACKUP_SIGNING_KEY`

See `.env.example` for the full list.

## One-Line Installer (GitHub Raw)
You can install and deploy with a single command:

```bash
curl -sL https://raw.githubusercontent.com/matinsenpai/felfelchat/main/install.sh | bash
```

Installer behavior:
- ask required values interactively (path/port/origin), and auto-generate secrets
- run `npm ci`, `prisma migrate deploy`, `npm run build`
- install/start `systemd` service when available (or fallback `nohup`)
- install global `felfel` command

After install:

```bash
felfel
```

`felfel` opens the TUI manager for:
- status dashboard (mode, status, port/origin, last deploy/backup)
- start/stop/restart
- live logs
- health/readiness checks
- full deploy (pull + install + migrate + build + restart)
- setup wizard for env/port/origin/secrets
- backup/restore
- launcher repair

## Useful Commands
```bash
# lint
npm run lint

# production build
npm run build

# run production server
npm run start

# prisma studio
npm run db:studio
```

## Operations and Incident Runbook
See:
- `docs/OPERATIONS.md`

Includes:
- health/readiness usage
- incident response flow
- secret rotation policy
- production deployment checklist

## Local Development
1. Install dependencies:
```bash
npm install
```

2. Create env file:
```bash
cp .env.example .env
```

3. Run migrations:
```bash
npx prisma migrate deploy
```

4. Start dev server:
```bash
npm run dev
```

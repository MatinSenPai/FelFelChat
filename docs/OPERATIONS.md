# Operations Runbook

## Health and Readiness
- Liveness: `GET /api/health` should return `200` with `status: ok`.
- Readiness: `GET /api/ready` should return:
  - `200` with `status: ready` when dependencies are healthy.
  - `503` with `status: not-ready` when any check fails.

## Required Environment Variables
- `JWT_SECRET`
- `APP_ORIGIN`
- `BACKUP_SIGNING_KEY`

## Incident Response
1. Confirm impact and scope from logs (`admin-audit.log`, app logs).
2. If auth/session compromise is suspected:
   - Rotate `JWT_SECRET`.
   - Force logout by restarting services and invalidating old tokens.
3. If backup tampering is suspected:
   - Do not restore unsigned/unverified backups.
   - Validate signature metadata before any restore.
4. If storage abuse is suspected:
   - Temporarily disable uploads at reverse proxy or app layer.
   - Inspect upload directory and recent message attachments.
5. Document timeline, actions, and remediation items in incident notes.

## Secret Rotation Policy
- Rotate `JWT_SECRET` every 90 days or immediately after suspected compromise.
- Rotate `BACKUP_SIGNING_KEY` every 180 days.
- Store secrets in deployment secret manager, not in repository.
- Keep an internal rotation log with:
  - Secret name
  - Rotation timestamp
  - Operator
  - Rollout status

## Deployment Checklist
- `npm run lint` passes.
- `npm run build` passes.
- `/api/health` is `ok`.
- `/api/ready` is `ready`.
- Backup signature verification tested with one create+restore dry run.

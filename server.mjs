import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  });
}

function log(level, message, context = undefined) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

process.on('uncaughtException', (error) => {
  log('error', 'uncaughtException', { error: error.message });
  if (process.env.SENTRY_DSN) Sentry.captureException(error);
});

process.on('unhandledRejection', (reason) => {
  log('error', 'unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
  }
});

const prisma = new PrismaClient();
const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
      "img-src 'self' data: blob:; media-src 'self' blob:; " +
      "font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss:"
  );

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

// Active call state (only 1 at a time)
let activeCall = null; // { callerId, calleeId, logId, startedAt }

app.prepare().then(() => {
  const server = createServer((req, res) => {
    applySecurityHeaders(res);
    const parsedUrl = parse(req.url, true);
    
    // Serve uploaded files from ./uploads directory
    if (parsedUrl.pathname && parsedUrl.pathname.startsWith('/uploads/')) {
      const relativePath = decodeURIComponent(parsedUrl.pathname.slice('/uploads/'.length));
      const normalizedRelativePath = path.normalize(relativePath).replace(/^([/\\])+/, '');
      const filePath = path.resolve(UPLOAD_ROOT, normalizedRelativePath);

      // Block path traversal and invalid paths
      if (
        !relativePath ||
        relativePath.includes('\0') ||
        !filePath.startsWith(UPLOAD_ROOT + path.sep)
      ) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.mp4': 'video/mp4',
          '.pdf': 'application/pdf',
          '.txt': 'text/plain',
        };
        
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }
    
    handle(req, res, parsedUrl);
  });

  // Socket.io
  const io = new Server(server, {
    cors: {
      origin: process.env.APP_ORIGIN || false,
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // Track online users
  const onlineUsers = new Map(); // userId -> socketId

  // Auth middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        // Try cookie
        const cookieHeader = socket.handshake.headers?.cookie || '';
        const tokenMatch = cookieHeader.match(/token=([^;]+)/);
        if (!tokenMatch) {
          log('warn', 'socket.auth.failed', { reason: 'no_token' });
          return next(new Error('No token'));
        }
        const decoded = jwt.verify(tokenMatch[1], JWT_SECRET);
        socket.user = decoded;
      } else {
        socket.user = jwt.verify(token, JWT_SECRET);
      }
      next();
    } catch (err) {
      log('warn', 'socket.auth.error', { error: err.message });
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      next(new Error('Auth error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const username = socket.user.username;
    const joinedRooms = new Set();

    log('info', 'socket.connected', { userId, username });

    // Track online
    onlineUsers.set(userId, socket.id);
    socket.join(`user:${userId}`);
    io.emit('user:online', userId);

    // SuperAdmin monitoring room
    if (socket.user.isSuperAdmin) {
      socket.join('superadmin');
      // Send current active call info
      if (activeCall) {
        socket.emit('call:started', activeCall);
      }
      // Send online users count
      socket.emit('admin:onlineCount', onlineUsers.size);
    }

    // --- Room management ---
    socket.on('room:join', async (roomId) => {
      if (!roomId || typeof roomId !== 'string') return;

      const membership = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!membership) {
        return socket.emit('error', 'Forbidden');
      }

      joinedRooms.add(roomId);
      socket.join(`room:${roomId}`);
    });

    socket.on('room:leave', (roomId) => {
      joinedRooms.delete(roomId);
      socket.leave(`room:${roomId}`);
    });

    // --- Messages ---
    socket.on('message:send', async (data) => {
      if (!data?.roomId || typeof data.roomId !== 'string') return;

      const membership = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId: data.roomId } },
      });
      if (!membership) {
        return socket.emit('error', 'Forbidden');
      }

      log('info', 'socket.message.send', { userId, roomId: data.roomId });
      // Broadcast to room members
      io.to(`room:${data.roomId}`).emit('message:new', {
        ...data,
        userId,
        username,
        createdAt: new Date().toISOString(),
      });
      log('info', 'socket.message.broadcast', { roomId: data.roomId });
    });

    socket.on('message:typing', async (roomId) => {
      if (!roomId || typeof roomId !== 'string') return;
      if (!joinedRooms.has(roomId)) return;

      const membership = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!membership) return;

      socket.to(`room:${roomId}`).emit('message:typing', username);
    });

    socket.on('message:read', async ({ messageId, roomId }) => {
      if (!roomId || typeof roomId !== 'string') return;
      if (!joinedRooms.has(roomId)) return;

      const membership = await prisma.roomMember.findUnique({
        where: { userId_roomId: { userId, roomId } },
      });
      if (!membership) return;

      io.to(`room:${roomId}`).emit('message:read', { messageId, userId });
    });

    // --- Voice Calls (1 at a time) ---
    socket.on('call:initiate', async ({ calleeId }) => {
      if (activeCall) {
        return socket.emit('call:error', 'A call is already active. Please wait.');
      }
      if (!calleeId || typeof calleeId !== 'string') {
        return socket.emit('call:error', 'Invalid callee');
      }

      const privateRoom = await prisma.room.findFirst({
        where: {
          type: 'PRIVATE',
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: calleeId } } },
          ],
        },
        select: { id: true },
      });
      if (!privateRoom) {
        return socket.emit('call:error', 'No private room with target user');
      }

      const logId = `call-${Date.now()}`; // simplified ID
      activeCall = {
        callerId: userId,
        calleeId,
        logId,
        callerName: username,
        startedAt: new Date().toISOString(),
      };

      // Notify callee
      io.to(`user:${calleeId}`).emit('call:incoming', {
        callerId: userId,
        callerName: username,
        logId,
      });

      // Notify superadmin
      io.to('superadmin').emit('call:started', activeCall);
    });

    socket.on('call:accept', ({ logId }) => {
      if (activeCall && activeCall.logId === logId) {
        if (![activeCall.callerId, activeCall.calleeId].includes(userId)) return;
        activeCall.status = 'ACTIVE';
        io.to(`user:${activeCall.callerId}`).emit('call:accepted', { logId });
        io.to('superadmin').emit('call:updated', { ...activeCall, status: 'ACTIVE' });
      }
    });

    socket.on('call:end', ({ logId }) => {
      if (!activeCall || ![activeCall.callerId, activeCall.calleeId].includes(userId)) return;
      endCall(logId, 'ENDED');
    });

    socket.on('call:reject', ({ logId }) => {
      if (!activeCall || ![activeCall.callerId, activeCall.calleeId].includes(userId)) return;
      endCall(logId, 'REJECTED');
    });

    // WebRTC signaling
    socket.on('call:signal', ({ targetUserId, signal }) => {
      if (!activeCall) return;
      const inCall = [activeCall.callerId, activeCall.calleeId];
      if (!inCall.includes(userId) || !inCall.includes(targetUserId)) return;

      io.to(`user:${targetUserId}`).emit('call:signal', {
        fromUserId: userId,
        signal,
      });
    });

    // SuperAdmin: terminate call
    socket.on('call:terminate', ({ logId }) => {
      if (!socket.user.isSuperAdmin) {
        return socket.emit('error', 'Forbidden');
      }
      endCall(logId, 'TERMINATED');
    });

    // Disconnect
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      io.emit('user:offline', userId);
      io.to('superadmin').emit('admin:onlineCount', onlineUsers.size);

      // End call if participant disconnects
      if (activeCall && (activeCall.callerId === userId || activeCall.calleeId === userId)) {
        endCall(activeCall.logId, 'ENDED');
      }
    });
  });

  function endCall(logId, status) {
    if (activeCall && activeCall.logId === logId) {
      const endedCall = { ...activeCall, status, endedAt: new Date().toISOString() };

      io.to(`user:${activeCall.callerId}`).emit('call:ended', { logId, status });
      io.to(`user:${activeCall.calleeId}`).emit('call:ended', { logId, status });
      io.to('superadmin').emit('call:ended', endedCall);

      activeCall = null;
    }
  }

  server.listen(port, hostname, () => {
    log('info', 'server.started', { url: `http://${hostname}:${port}` });
  });
});

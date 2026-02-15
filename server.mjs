import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const JWT_SECRET = process.env.JWT_SECRET || 'felfel-secret-change-me';

// Active call state (only 1 at a time)
let activeCall = null; // { callerId, calleeId, logId, startedAt }

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    
    // Serve uploaded files from ./uploads directory
    if (parsedUrl.pathname && parsedUrl.pathname.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), parsedUrl.pathname);
      
      // Check if file exists
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
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
    cors: { origin: '*' },
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
          console.log('[Socket.io] ❌ Auth failed: No token in auth or cookies');
          return next(new Error('No token'));
        }
        const decoded = jwt.verify(tokenMatch[1], JWT_SECRET);
        socket.user = decoded;
      } else {
        socket.user = jwt.verify(token, JWT_SECRET);
      }
      next();
    } catch (err) {
      console.log('[Socket.io] ❌ Auth error:', err.message);
      next(new Error('Auth error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const username = socket.user.username;

    console.log('[Socket.io] ✅ User connected:', username, '(', userId, ')');

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
    socket.on('room:join', (roomId) => {
      socket.join(`room:${roomId}`);
    });

    socket.on('room:leave', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // --- Messages ---
    socket.on('message:send', (data) => {
      console.log('[Socket.io] message:send from user:', userId, 'to room:', data.roomId);
      // Broadcast to room members
      io.to(`room:${data.roomId}`).emit('message:new', {
        ...data,
        userId,
        username,
        createdAt: new Date().toISOString(),
      });
      console.log('[Socket.io] Broadcasted message:new to room:', data.roomId);
    });

    socket.on('message:typing', (roomId) => {
      socket.to(`room:${roomId}`).emit('message:typing', username);
    });

    socket.on('message:read', ({ messageId, roomId }) => {
      io.to(`room:${roomId}`).emit('message:read', { messageId, userId });
    });

    // --- Voice Calls (1 at a time) ---
    socket.on('call:initiate', ({ calleeId }) => {
      if (activeCall) {
        return socket.emit('call:error', 'A call is already active. Please wait.');
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
        activeCall.status = 'ACTIVE';
        io.to(`user:${activeCall.callerId}`).emit('call:accepted', { logId });
        io.to('superadmin').emit('call:updated', { ...activeCall, status: 'ACTIVE' });
      }
    });

    socket.on('call:end', ({ logId }) => {
      endCall(logId, 'ENDED');
    });

    socket.on('call:reject', ({ logId }) => {
      endCall(logId, 'REJECTED');
    });

    // WebRTC signaling
    socket.on('call:signal', ({ targetUserId, signal }) => {
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
    console.log(`🌶️ FelFel Chat running at http://${hostname}:${port}`);
  });
});

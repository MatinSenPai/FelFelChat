import type { Server as SocketIOServer } from 'socket.io';

type SocketServerGlobal = typeof globalThis & {
  __felfelIo?: SocketIOServer;
};

export function setSocketServer(io: SocketIOServer) {
  (globalThis as SocketServerGlobal).__felfelIo = io;
}

export function getSocketServer(): SocketIOServer | null {
  return (globalThis as SocketServerGlobal).__felfelIo ?? null;
}

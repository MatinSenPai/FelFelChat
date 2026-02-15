import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'felfel-secret-change-me';

export interface JwtPayload {
  id: string;
  username: string;
  isSuperAdmin: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

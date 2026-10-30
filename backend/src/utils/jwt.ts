import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  userId: string;
  email: string;
}

export function signUserToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

export function verifyUserToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  });
  if (!decoded || typeof decoded !== 'object' || !('userId' in decoded) || !('email' in decoded)) {
    throw new Error('Invalid token structure');
  }
  return decoded as TokenPayload;
}

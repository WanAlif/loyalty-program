import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  role: 'USER' | 'ADMIN';
}

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30m';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in the environment');
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

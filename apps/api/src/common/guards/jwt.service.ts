import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { config } from '../../config';

export interface TokenPayload {
  sub: string;
  role: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtService {
  sign(payload: TokenPayload): string {
    const expiresIn = payload.type === 'access' ? '12h' : '30d';
    return jwt.sign(payload, config.jwtSecret as string, { expiresIn } as jwt.SignOptions);
  }

  verify(token: string): TokenPayload {
    return jwt.verify(token, config.jwtSecret as string) as unknown as TokenPayload;
  }
}

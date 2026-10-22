import type { Role } from '@medimate/shared';
import type { Config } from './config';
import type { DB } from './db/client';
import type { Clock } from './lib/clock';
import type { Logger } from './lib/logger';
import type { MessagingProvider } from './providers/messaging';
import type { PushSender } from './providers/push';
import type { PaymentProvider } from './providers/payments';

export interface Deps {
  db: DB;
  config: Config;
  clock: Clock;
  logger: Logger;
  messaging: MessagingProvider;
  payments: PaymentProvider;
  push: PushSender;
}

export interface AuthInfo {
  userId: string;
  phone: string | null;
  roles: Role[];
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthInfo;
    }
  }
}

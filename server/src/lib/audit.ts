import type { DB } from '../db/client';
import { auditLogs } from '../db/schema';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  detail?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Append-only audit trail. Rows are never updated or deleted by the application; a database trigger
 * (migration 0001) rejects UPDATE/DELETE on audit_logs. Do not put health values or message bodies in `detail`.
 */
export async function audit(db: Pick<DB, 'insert'>, e: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: e.actorId,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId ?? null,
    detail: e.detail ?? null,
    requestId: e.requestId ?? null,
  });
}

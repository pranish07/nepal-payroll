import type { AppDatabase } from '../db/client.js';
import { auditLog } from '../db/schema.js';
import type { Role } from '../roles.js';
import { nowIso, newId } from '../util.js';

export interface AuditInput {
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  details?: unknown;
}

export function writeAudit(database: AppDatabase, input: AuditInput): void {
  database.db
    .insert(auditLog)
    .values({
      id: newId(),
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      detailJson: input.details === undefined ? null : JSON.stringify(input.details),
      createdAt: nowIso(),
    })
    .run();
}

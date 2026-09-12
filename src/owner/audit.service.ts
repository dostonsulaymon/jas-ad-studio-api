import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import type { Executor } from '../common/db/transaction';
import type { AuditTarget, AuditWriter } from './public/audit.port';

@Injectable()
export class AuditService implements AuditWriter {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(
    ownerId: string,
    action: string,
    targetType: AuditTarget,
    targetId: string,
    details: Record<string, unknown> = {},
    tx: Executor = this.pool,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO owner_audit_log (owner_id, action, target_type, target_id, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [ownerId, action, targetType, targetId, JSON.stringify(details)],
    );
  }
}

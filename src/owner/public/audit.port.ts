/** The owner module's public contract (R-7). */
import { z } from 'zod';
import type { Executor } from '../../common/db/transaction';

export const AUDIT_TARGETS = ['credit_order', 'user', 'credit_pack', 'site_setting'] as const;
export type AuditTarget = (typeof AUDIT_TARGETS)[number];

export const auditEntrySchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  createdAt: z.iso.datetime(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const AUDIT_WRITER = Symbol('AUDIT_WRITER');

export interface AuditWriter {
  /**
   * Takes an Executor so the audit row lands in the SAME transaction as the action it
   * describes. A crash between the two would otherwise leave a credit with no record of
   * who caused it.
   */
  record(
    ownerId: string,
    action: string,
    targetType: AuditTarget,
    targetId: string,
    details: Record<string, unknown>,
    tx?: Executor,
  ): Promise<void>;
}

import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { OwnerController } from './owner.controller';
import { OwnerReportsService } from './owner-reports.service';
import { OwnerGuard } from './owner.guard';
import { AUDIT_WRITER } from './public/audit.port';

@Global()
@Module({
  controllers: [OwnerController],
  providers: [OwnerReportsService, AuditService, OwnerGuard, { provide: AUDIT_WRITER, useExisting: AuditService }],
  exports: [AUDIT_WRITER],
})
export class OwnerModule {}

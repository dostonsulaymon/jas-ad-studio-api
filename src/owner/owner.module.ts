import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { OwnerController } from './owner.controller';
import { OwnerGuard } from './owner.guard';
import { AUDIT_WRITER } from './public/audit.port';

@Global()
@Module({
  controllers: [OwnerController],
  providers: [AuditService, OwnerGuard, { provide: AUDIT_WRITER, useExisting: AuditService }],
  exports: [AUDIT_WRITER],
})
export class OwnerModule {}

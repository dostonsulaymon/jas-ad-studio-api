import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import type { ReadinessIndicator } from './health.types';

@Injectable()
export class PostgresIndicator implements ReadinessIndicator {
  readonly name = 'postgres';

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async check(): Promise<void> {
    await this.pool.query('select 1');
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import type { EventLog, EventName, EventProps } from './public/events.port';

/** Longer than any id, code or enum we record; far too short to hold a prompt or brief. */
export const MAX_PROP_LENGTH = 64;

export function sanitizeProps(props: EventProps): EventProps {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.slice(0, MAX_PROP_LENGTH) : value,
    ]),
  );
}

@Injectable()
export class EventsService implements EventLog {
  private readonly logger = new Logger(EventsService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(name: EventName, userId: string | null, props: EventProps = {}): Promise<void> {
    try {
      await this.pool.query(`INSERT INTO events (user_id, name, props) VALUES ($1,$2,$3)`, [
        userId || null,
        name,
        JSON.stringify(sanitizeProps(props)),
      ]);
    } catch (error) {
      this.logger.warn(`event ${name} not recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

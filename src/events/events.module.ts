import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EVENT_LOG } from './public/events.port';

/** Global so any module records an event through the port without importing this file (R-7). */
@Global()
@Module({
  providers: [EventsService, { provide: EVENT_LOG, useExisting: EventsService }],
  exports: [EVENT_LOG],
})
export class EventsModule {}

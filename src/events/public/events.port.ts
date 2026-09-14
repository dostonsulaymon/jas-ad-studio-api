/** The events module's public contract (R-7). */

export const EVENT_NAMES = [
  'sign_in',
  'project_created',
  'project_deleted',
  'generation_requested',
  'generation_settled',
  'order_created',
  'order_confirmed',
  'order_rejected',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Short primitives only. A prompt, brief or image can never fit (source 01 §37). */
export type EventProps = Record<string, string | number | boolean | null>;

export const EVENT_LOG = Symbol('EVENT_LOG');

export interface EventLog {
  /**
   * Best effort by design: it never throws. A seller's action must not fail because an
   * analytics row could not be written.
   */
  record(name: EventName, userId: string | null, props?: EventProps): Promise<void>;
}

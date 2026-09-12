/** DI tokens for values resolved from config at module setup. */
export const OWNER_EMAILS = Symbol('OWNER_EMAILS');
/** null when either Google key is absent, so sign-in fails rather than the boot (D-061). */
export const GOOGLE_CONFIG = Symbol('GOOGLE_CONFIG');
/** Where a completed sign-in lands. */
export const WEB_ORIGIN = Symbol('WEB_ORIGIN');
/** Origins the CSRF guard accepts on a state-changing request (spec §10). */
export const ALLOWED_ORIGINS = Symbol('ALLOWED_ORIGINS');

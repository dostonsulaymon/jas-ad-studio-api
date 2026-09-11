// Runs before any module is imported. @nestjs/config validates inside forRoot(), which
// executes at import time, so these must be set here rather than in a beforeAll hook.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgres://jas:jas@127.0.0.1:5437/jas_ad_studio_test';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6384';

'use strict';
process.env.SQLITE_FILENAME  = ':memory:';
process.env.NODE_ENV         = 'test';
process.env.SESSION_SECRET   = 'test-secret-for-jest-sessions-not-for-production';
process.env.REDIS_URL        = '';
process.env.PORT             = '0';

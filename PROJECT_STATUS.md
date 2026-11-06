# AARIVA Project Status

AARIVA is a student-only dining app with a small React frontend and Express/MongoDB API.

## Student flow

1. Sign in or create a student account.
2. Browse weekly published meals dynamically starting on Sunday through Saturday.
3. Reserve or cancel a meal before its booking deadline.
4. Review upcoming reservations and their sample ₹50-per-meal total.
5. Create a demo receipt. This does not process a payment.

The app supports one dining location. Staff pages and staff APIs have been removed. The production database must be configured with published menus before students can make reservations.

## Run and verify

Run `npm install` and `npm run dev`. Local development uses an in-memory MongoDB and sample student account unless `SEED_DEMO_DATA=false` or a MongoDB URI is configured.

Run `npm run check` to run the integration tests and create a production client build.

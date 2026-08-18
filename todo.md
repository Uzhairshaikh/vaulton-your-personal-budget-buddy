# Project TODO - Smart Purchase & Warranty Manager

- [x] Define database schema for purchases, line items, warranties, returns, and notifications in `drizzle/schema.ts`
- [x] Generate migration SQL and execute via `webdev_execute_sql`
- [x] Implement robust storage and AI receipt parsing helper functions (supporting image/PDF AI extraction of merchant name, purchase date, line items, total amount, warranty duration, return window)
- [x] Implement backend tRPC routers for purchases, receipt parsing, warranty tracking, return tracking, analytics, and reminders
- [x] Create frontend DashboardLayout navigation with sidebar and professional styling (Tailwind + shadcn/ui)
- [x] Implement Dashboard Overview with key metrics, upcoming warranty/return expiry countdowns, and quick actions
- [x] Implement Receipt Upload & AI Extraction modal/page with image/PDF preview and structured field confirmation
- [x] Implement Manual Purchase Entry form as a fallback
- [x] Implement Purchases List view with search, category filtering, and sorting
- [x] Implement Warranty Tracker showing active warranties with expiry dates and days remaining
- [x] Implement Return Deadline Tracker with countdown timers and exact states: active, expiring soon, and expired
- [x] Implement Spending Analytics dashboard with charts (monthly spend, category breakdown, top merchants)
- [x] Implement Purchase Detail page with metadata editing, receipt viewer, and timeline
- [x] Implement 7-day and 1-day deadline reminder notifications and alert banner / center
- [x] Write Vitest unit tests for backend routers and AI extraction parsing
- [x] Verify UI interactions, responsive design, and save final checkpoint
- [x] Fix route registration so purchases, warranties, returns, insights, and purchase detail pages render the Receiptwise shell instead of the generic 404 page.

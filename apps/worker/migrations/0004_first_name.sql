-- Mirror Clerk's first_name onto the users row so we can show it in
-- archive/profile UIs without round-tripping to Clerk per request.
ALTER TABLE users ADD COLUMN first_name TEXT;

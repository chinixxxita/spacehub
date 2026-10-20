-- CSPC SpaceHub: least-privilege application database account
-- Run this file as MySQL root/administrator, NOT from the Node.js application.
-- Replace the password before running it.

CREATE USER IF NOT EXISTS 'spacehub_app'@'localhost'
  IDENTIFIED BY 'CHANGE_THIS_TO_A_LONG_RANDOM_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON cspc_spacehub.*
  TO 'spacehub_app'@'localhost';

FLUSH PRIVILEGES;

-- Intentionally NOT granted to the application account:
-- CREATE, ALTER, DROP, GRANT OPTION, FILE, PROCESS, SUPER.
-- Apply schema changes separately using database/schema.sql or a DBA migration.

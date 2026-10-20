# CSPC SpaceHub – Phase 5 Campus Background (Forced)

This version forces the supplied CSPC campus image onto the login page using both CSS and inline page styles, and cache-busts the stylesheet.

IMPORTANT: Start this exact extracted folder. Stop any existing Node server first.

Windows:
1. Press Ctrl+C in the terminal running the old server.
2. Open a new terminal in this extracted folder.
3. Run: npm install
4. Run: node app.js
5. Open: http://localhost:3000/login
6. Hard refresh: Ctrl+Shift+R

If the page still shows the old login, the browser is connected to a different Node project/server. Check the terminal where `node app.js` is running and make sure its current directory is this extracted folder.


## Data protection and database access
See `DATA-PROTECTION-DATABASE-ACCESS.md` and `database/least-privilege.sql`. The app uses parameterized queries, protected sessions, bcrypt password hashing, production error redaction, and an optional least-privilege MySQL account.


## Audit Trail + Facility Maintenance

New admin features:
- **Audit Trail** at `/admin/audit`: records reservation submissions, approvals, rejections, cancellations, facility changes, user status changes, and maintenance actions.
- **Facility Maintenance** at `/admin/maintenance`: schedule a facility as unavailable for a date range, complete/cancel schedules, and prevent new reservations during scheduled maintenance.

For an existing database, run `database/migrations/20261002_audit_maintenance.sql` in MySQL/phpMyAdmin.
For a fresh database, `database/schema.sql` already includes the new tables.
To add Room 1-6 and the labs (Mac Lab, IT Lab 1, IT Lab 2, NAS Lab, RISE Lab, CCS Lab) to an existing database, run `database/migrations/20261013_add_rooms_and_labs.sql`. Capacities are placeholders; edit them in Admin > Manage Facilities.

Scheduled maintenance is date-based for the full operating day. The system refuses to create a maintenance period if a Pending or Approved reservation already exists on any affected date, protecting existing bookings.

## Troubleshooting: "500 Server Error" page
In development the 500 page now explains the cause. The terminal running `npm start` always prints the full error.
- **"The database could not be reached"**: start MySQL (XAMPP / Laragon / the MySQL service). If it is running, set `DB_HOST=127.0.0.1` in `.env` instead of `localhost`.
- **"A database table is missing"**: run `database/schema.sql`, then the files in `database/migrations/` in date order.

## Operating hours
Facilities can be reserved from **7:00 AM to 7:00 PM** in 15-minute steps. To change this, edit `OPEN_HOUR` and `CLOSE_HOUR` near the top of `routes/reservations.js`; the server checks, the start/end drop-downs and the availability data all follow those two values.

## Booking rules
- A reservation can include at most **50 users** (`MAX_USERS_PER_BOOKING` in `routes/reservations.js`).
- If the group is larger than the facility's capacity (up to 50), the form asks whether additional chairs are wanted; the answer is saved as a line at the end of the reservation's purpose details so the administrator sees it.
- Laboratory bookings show a note that only **50 computers** are available (`COMPUTERS_AVAILABLE`).
- A reservation can be cancelled only until its **start time**. After that, the Cancel button is replaced by "Past" and the server also refuses the request.
- The calendar shows no booked, pending or maintenance entries for dates that have already passed.

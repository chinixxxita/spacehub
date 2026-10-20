const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    // Dashboard is role-aware: administrators use the same /dashboard entry
    // point, but see the administrative dashboard content.
    if (req.session.user.role === "admin") {
      const [[counts]] = await db.execute(`
        SELECT
          SUM(status = 'Pending') AS pending,
          SUM(status = 'Approved') AS approved,
          SUM(status = 'Rejected') AS rejected,
          SUM(status = 'Completed') AS completed,
          COUNT(*) AS total
        FROM reservations
      `);
      const [[rooms]] = await db.execute(`
        SELECT COUNT(*) AS total,
               SUM(type='Room') AS regular_rooms,
               SUM(type='Laboratory') AS laboratories
        FROM rooms
      `);
      const [[users]] = await db.execute(`
        SELECT COUNT(*) AS total,
               SUM(role='student') AS students,
               SUM(role='faculty') AS faculty
        FROM users
        WHERE status='Active'
      `);
      const [pending] = await db.execute(`
        SELECT r.id, r.reference_no, r.reservation_date, r.start_time, r.end_time,
               r.purpose, r.number_of_users, u.full_name, u.role,
               rm.name AS room_name, rm.type
        FROM reservations r
        JOIN users u ON u.id = r.user_id
        JOIN rooms rm ON rm.id = r.room_id
        WHERE r.status = 'Pending'
        ORDER BY r.created_at ASC
        LIMIT 8
      `);

      return res.render("admin/dashboard", {
        title: "Dashboard",
        counts,
        rooms,
        users,
        pending
      });
    }

    const userId = req.session.user.id;

    const [reservations] = await db.execute(
      `SELECT r.reference_no, r.reservation_date, r.start_time, r.end_time,
              r.status, rm.name AS room_name, rm.type
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       WHERE r.user_id = ?
       ORDER BY r.reservation_date DESC, r.start_time DESC
       LIMIT 5`,
      [userId]
    );

    const [counts] = await db.execute(
      `SELECT
        SUM(status = 'Pending') AS pending,
        SUM(status = 'Approved') AS approved,
        SUM(status = 'Rejected') AS rejected,
        SUM(status = 'Completed') AS completed
       FROM reservations
       WHERE user_id = ?`,
      [userId]
    );

    res.render("dashboard/index", {
      title: "Dashboard",
      reservations,
      counts: counts[0]
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

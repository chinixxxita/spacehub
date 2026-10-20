const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function parseMonth(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function monthInfo(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  return { year, month, days, leading };
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

router.get("/", async (req, res, next) => {
  try {
    // Optional facility filter (?room=ID). Anything that is not a positive integer means "all facilities".
    const roomFilter = /^\d+$/.test(String(req.query.room || "")) ? Number(req.query.room) : null;
    const [roomList] = await db.execute(`SELECT id, name, type FROM rooms ORDER BY type, name`);
    const activeRoom = roomList.find((r) => r.id === roomFilter) ? roomFilter : null;

    const requested = parseMonth(req.query.month);
    const selected = requested || new Date();
    const { year, month, days, leading } = monthInfo(selected);
    const startDate = isoDate(year, month, 1);
    const endDate = isoDate(year, month, days);

    // DATE_FORMAT is intentional here. mysql2 can return DATE/DATETIME values
    // as JavaScript Date objects depending on connection settings. Formatting
    // them in SQL guarantees the EJS date keys remain YYYY-MM-DD.
    const [reservations] = await db.execute(`
      SELECT
        r.id,
        r.user_id,
        r.reference_no,
        DATE_FORMAT(r.reservation_date, '%Y-%m-%d') AS reservation_date,
        r.start_time,
        r.end_time,
        r.status,
        r.purpose,
        rm.name AS room_name,
        rm.type AS room_type
      FROM reservations r
      JOIN rooms rm ON rm.id = r.room_id
      WHERE r.reservation_date BETWEEN ? AND ?
        AND r.status IN ('Pending', 'Approved')
        ${activeRoom ? "AND r.room_id = ?" : ""}
      ORDER BY r.reservation_date, r.start_time
    `, activeRoom ? [startDate, endDate, activeRoom] : [startDate, endDate]);

    const [maintenance] = await db.execute(`
      SELECT
        m.id,
        m.room_id,
        DATE_FORMAT(m.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(m.end_date, '%Y-%m-%d') AS end_date,
        m.reason,
        m.status,
        rm.name AS room_name
      FROM facility_maintenance m
      JOIN rooms rm ON rm.id = m.room_id
      WHERE m.status = 'Scheduled'
        AND m.start_date <= ?
        AND m.end_date >= ?
        ${activeRoom ? "AND m.room_id = ?" : ""}
      ORDER BY m.start_date, rm.name
    `, activeRoom ? [endDate, startDate, activeRoom] : [endDate, startDate]);

    const byDate = {};
    const maintenanceByDate = {};

    reservations.forEach((r) => {
      const key = String(r.reservation_date).slice(0, 10);
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(r);
    });

    maintenance.forEach((m) => {
      const start = new Date(`${String(m.start_date).slice(0, 10)}T00:00:00`);
      const end = new Date(`${String(m.end_date).slice(0, 10)}T00:00:00`);
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (!maintenanceByDate[key]) maintenanceByDate[key] = [];
        maintenanceByDate[key].push(m);
      }
    });

    const now = new Date();
    const today = isoDate(now.getFullYear(), now.getMonth(), now.getDate());

    const cells = [];
    for (let i = 0; i < leading; i++) cells.push({ blank: true });
    for (let day = 1; day <= days; day++) {
      const key = isoDate(year, month, day);
      cells.push({
        day,
        date: key,
        // Past dates show no bookings, pending requests or maintenance.
        reservations: key < today ? [] : (byDate[key] || []),
        maintenance: key < today ? [] : (maintenanceByDate[key] || [])
      });
    }
    while (cells.length % 7 !== 0) cells.push({ blank: true });

    const previous = new Date(year, month - 1, 1);
    const next = new Date(year, month + 1, 1);

    res.render("calendar/index", {
      title: "Calendar",
      selected,
      year,
      month,
      monthName: selected.toLocaleString("en-US", { month: "long" }),
      cells,
      today,
      previousMonth: `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`,
      nextMonth: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
      rooms: roomList,
      activeRoom,
      isAdminCalendar: req.session.user.role === "admin",
      currentUserId: req.session.user.id
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

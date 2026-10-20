const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { requireRole } = require("../middleware/auth");
const { writeAudit } = require("../utils/audit");

const router = express.Router();
const adminOnly = requireRole("admin");

router.use(adminOnly);

router.get("/dashboard", async (req, res) => {
  // Keep the old admin URL working while /dashboard is the single sidebar entry.
  res.redirect("/dashboard");
});

router.get("/audit", async (req, res, next) => {
  try {
    const [logs] = await db.execute(`
      SELECT a.*, u.full_name, u.school_id, u.role
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 300
    `);
    res.render("admin/audit", { title: "Audit Trail", logs });
  } catch (err) { next(err); }
});

router.get("/maintenance", async (req, res, next) => {
  try {
    const [maintenance] = await db.execute(`
      SELECT m.*, rm.name AS room_name, rm.type AS room_type, u.full_name AS created_by_name
      FROM facility_maintenance m
      JOIN rooms rm ON rm.id = m.room_id
      JOIN users u ON u.id = m.created_by
      ORDER BY m.start_date ASC, m.created_at DESC
    `);
    const [rooms] = await db.execute(`SELECT id, name, type FROM rooms ORDER BY type, name`);
    res.render("admin/maintenance", { title: "Facility Maintenance", maintenance, rooms, today: new Date().toISOString().slice(0,10) });
  } catch (err) { next(err); }
});

router.post("/maintenance", async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const roomId = Number(req.body.room_id);
    const startDate = String(req.body.start_date || "").trim();
    const endDate = String(req.body.end_date || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!Number.isInteger(roomId) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate || reason.length < 3 || reason.length > 255) {
      req.flash("error", "Please provide a valid facility, date range, and maintenance reason.");
      return res.redirect("/admin/maintenance");
    }
    await connection.beginTransaction();
    const [rooms] = await connection.execute(`SELECT id, name FROM rooms WHERE id=? LIMIT 1`, [roomId]);
    if (!rooms.length) { await connection.rollback(); req.flash("error", "Facility not found."); return res.redirect("/admin/maintenance"); }
    const [conflicts] = await connection.execute(`
      SELECT reference_no FROM reservations
      WHERE room_id=? AND reservation_date BETWEEN ? AND ?
        AND status IN ('Pending','Approved')
      LIMIT 1
    `, [roomId, startDate, endDate]);
    if (conflicts.length) {
      await connection.rollback();
      req.flash("error", `Maintenance cannot be scheduled because reservation ${conflicts[0].reference_no} exists within the selected dates.`);
      return res.redirect("/admin/maintenance");
    }
    const [result] = await connection.execute(`INSERT INTO facility_maintenance (room_id,start_date,end_date,reason,status,created_by) VALUES (?,?,?,?,'Scheduled',?)`, [roomId,startDate,endDate,reason,req.session.user.id]);
    await writeAudit(connection, { userId:req.session.user.id, action:"SCHEDULE_MAINTENANCE", entityType:"facility_maintenance", entityId:result.insertId, details:`Scheduled ${rooms[0].name} from ${startDate} to ${endDate}: ${reason}`, req });
    await connection.commit();
    req.flash("success", `Maintenance scheduled for ${rooms[0].name}.`);
    res.redirect("/admin/maintenance");
  } catch (err) { try { await connection.rollback(); } catch {} next(err); }
  finally { connection.release(); }
});

router.post("/maintenance/:id/cancel", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`SELECT m.id,m.status,rm.name AS room_name FROM facility_maintenance m JOIN rooms rm ON rm.id=m.room_id WHERE m.id=? LIMIT 1`, [req.params.id]);
    if (!rows.length) { req.flash("error", "Maintenance schedule not found."); return res.redirect("/admin/maintenance"); }
    if (rows[0].status !== "Scheduled") { req.flash("error", "Only scheduled maintenance can be cancelled."); return res.redirect("/admin/maintenance"); }
    await db.execute(`UPDATE facility_maintenance SET status='Cancelled' WHERE id=?`, [req.params.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"CANCEL_MAINTENANCE", entityType:"facility_maintenance", entityId:req.params.id, details:`Cancelled maintenance for ${rows[0].room_name}`, req });
    req.flash("success", "Maintenance schedule cancelled.");
    res.redirect("/admin/maintenance");
  } catch (err) { next(err); }
});

router.post("/maintenance/:id/complete", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`SELECT m.id,m.status,rm.name AS room_name FROM facility_maintenance m JOIN rooms rm ON rm.id=m.room_id WHERE m.id=? LIMIT 1`, [req.params.id]);
    if (!rows.length) { req.flash("error", "Maintenance schedule not found."); return res.redirect("/admin/maintenance"); }
    if (rows[0].status !== "Scheduled") { req.flash("error", "Only scheduled maintenance can be completed."); return res.redirect("/admin/maintenance"); }
    await db.execute(`UPDATE facility_maintenance SET status='Completed' WHERE id=?`, [req.params.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"COMPLETE_MAINTENANCE", entityType:"facility_maintenance", entityId:req.params.id, details:`Completed maintenance for ${rows[0].room_name}`, req });
    req.flash("success", "Maintenance marked as completed.");
    res.redirect("/admin/maintenance");
  } catch (err) { next(err); }
});

router.get("/requests", async (req, res, next) => {
  try {
    const status = req.query.status || "Pending";
    const allowed = ["Pending", "Approved", "Rejected", "Cancelled", "Completed", "All"];
    const filter = allowed.includes(status) ? status : "Pending";

    let sql = `
      SELECT r.*, u.school_id, u.full_name, u.email, u.role,
             rm.name AS room_name, rm.type AS room_type
      FROM reservations r
      JOIN users u ON u.id = r.user_id
      JOIN rooms rm ON rm.id = r.room_id
    `;
    const params = [];
    if (filter !== "All") {
      sql += ` WHERE r.status = ?`;
      params.push(filter);
    }
    sql += ` ORDER BY r.created_at DESC`;

    const [requests] = await db.execute(sql, params);
    res.render("admin/requests", { title: "Reservation Requests", requests, filter });
  } catch (err) { next(err); }
});

router.get("/requests/:id", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT r.*, u.school_id, u.full_name, u.email, u.role,
             rm.name AS room_name, rm.type AS room_type, rm.building, rm.floor, rm.capacity,
             rm.air_conditioned, rm.has_computers, rm.computer_count
      FROM reservations r
      JOIN users u ON u.id = r.user_id
      JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id = ?
      LIMIT 1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).render("errors/404", { title: "Request Not Found" });
    res.render("admin/request-detail", { title: "Reservation Request", reservation: rows[0] });
  } catch (err) { next(err); }
});

router.post("/requests/:id/approve", async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(`
      SELECT r.*, rm.name AS room_name
      FROM reservations r JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id = ? LIMIT 1
    `, [req.params.id]);
    if (!rows.length) {
      await connection.rollback();
      req.flash("error", "Reservation request not found.");
      return res.redirect("/admin/requests");
    }

    const r = rows[0];
    if (r.status !== "Pending") {
      await connection.rollback();
      req.flash("error", "Only Pending reservations can be approved.");
      return res.redirect(`/admin/requests/${r.id}`);
    }

    const [conflicts] = await connection.execute(`
      SELECT id FROM reservations
      WHERE room_id = ? AND reservation_date = ?
        AND status = 'Approved'
        AND start_time < ? AND end_time > ?
        AND id <> ?
      LIMIT 1
    `, [r.room_id, r.reservation_date, r.end_time, r.start_time, r.id]);

    if (conflicts.length) {
      await connection.rollback();
      req.flash("error", "This request conflicts with an already approved reservation. It cannot be approved.");
      return res.redirect(`/admin/requests/${r.id}`);
    }

    await connection.execute(`UPDATE reservations SET status='Approved', rejection_reason=NULL WHERE id=?`, [r.id]);
    await writeAudit(connection, { userId:req.session.user.id, action:"APPROVE_RESERVATION", entityType:"reservation", entityId:r.id, details:`Approved ${r.reference_no}`, req });
    await connection.execute(`
      INSERT INTO notifications (user_id, title, message)
      VALUES (?, ?, ?)
    `, [r.user_id, "Reservation Approved", `Your reservation ${r.reference_no} for ${r.room_name} has been approved.`]);

    await connection.commit();
    req.flash("success", `Reservation ${r.reference_no} approved.`);
    res.redirect(`/admin/requests/${r.id}`);
  } catch (err) {
    try { await connection.rollback(); } catch {}
    next(err);
  } finally { connection.release(); }
});

router.post("/requests/:id/reject", async (req, res, next) => {
  try {
    const reason = String(req.body.rejection_reason || "").trim();
    if (!reason) {
      req.flash("error", "A rejection reason is required.");
      return res.redirect(`/admin/requests/${req.params.id}`);
    }

    const [rows] = await db.execute(`
      SELECT r.id, r.reference_no, r.user_id, r.status, rm.name AS room_name
      FROM reservations r JOIN rooms rm ON rm.id=r.room_id WHERE r.id=? LIMIT 1
    `, [req.params.id]);
    if (!rows.length) {
      req.flash("error", "Reservation request not found.");
      return res.redirect("/admin/requests");
    }
    if (rows[0].status !== "Pending") {
      req.flash("error", "Only Pending reservations can be rejected.");
      return res.redirect(`/admin/requests/${req.params.id}`);
    }

    await db.execute(`UPDATE reservations SET status='Rejected', rejection_reason=? WHERE id=?`, [reason, req.params.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"REJECT_RESERVATION", entityType:"reservation", entityId:req.params.id, details:`Rejected ${rows[0].reference_no}: ${reason}`, req });
    await db.execute(`
      INSERT INTO notifications (user_id, title, message)
      VALUES (?, ?, ?)
    `, [rows[0].user_id, "Reservation Rejected", `Your reservation ${rows[0].reference_no} for ${rows[0].room_name} was rejected. Reason: ${reason}`]);

    req.flash("success", `Reservation ${rows[0].reference_no} rejected.`);
    res.redirect(`/admin/requests/${req.params.id}`);
  } catch (err) { next(err); }
});

router.get("/rooms", async (req, res, next) => {
  try {
    const [rooms] = await db.execute(`SELECT * FROM rooms ORDER BY type, name`);
    const [maintenance] = await db.execute(`
      SELECT m.*, rm.name AS room_name
      FROM facility_maintenance m JOIN rooms rm ON rm.id=m.room_id
      WHERE m.status='Scheduled' AND m.end_date >= CURDATE()
      ORDER BY m.start_date, rm.name
    `);
    res.render("admin/rooms", { title: "Manage Rooms & Laboratories", rooms, maintenance });
  } catch (err) { next(err); }
});

router.get("/rooms/new", (req, res) => res.render("admin/room-form", { title: "Add Facility", room: null }));
router.get("/rooms/:id/edit", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM rooms WHERE id=? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).render("errors/404", { title: "Facility Not Found" });
    res.render("admin/room-form", { title: "Edit Facility", room: rows[0] });
  } catch (err) { next(err); }
});

router.post("/rooms/save", async (req, res, next) => {
  try {
    const { id, name, type, building, floor, capacity, air_conditioned, has_computers, computer_count, description, status } = req.body;
    const safeType = ["Room", "Laboratory"].includes(type) ? type : "Room";
    const safeStatus = ["Available", "Unavailable", "Maintenance"].includes(status) ? status : "Available";
    const cap = Number(capacity);
    const pcs = safeType === "Laboratory" && has_computers === "on" ? Math.max(0, Number(computer_count || 0)) : 0;
    if (!name || !Number.isInteger(cap) || cap < 1) {
      req.flash("error", "Facility name and a valid capacity are required.");
      return res.redirect(id ? `/admin/rooms/${id}/edit` : "/admin/rooms/new");
    }

    if (id) {
      await db.execute(`UPDATE rooms SET name=?, type=?, building=?, floor=?, capacity=?, air_conditioned=?, has_computers=?, computer_count=?, description=?, status=? WHERE id=?`,
        [name.trim(), safeType, building || null, floor || null, cap, air_conditioned === "on", pcs > 0, pcs, description || null, safeStatus, id]);
      await writeAudit(db, { userId:req.session.user.id, action:"UPDATE_FACILITY", entityType:"room", entityId:id, details:`Updated facility ${name.trim()}`, req });
      req.flash("success", "Facility updated successfully.");
    } else {
      await db.execute(`INSERT INTO rooms (name,type,building,floor,capacity,air_conditioned,has_computers,computer_count,description,status) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [name.trim(), safeType, building || null, floor || null, cap, air_conditioned === "on", pcs > 0, pcs, description || null, safeStatus]);
      const [created] = await db.execute(`SELECT id FROM rooms WHERE name=? LIMIT 1`, [name.trim()]);
      await writeAudit(db, { userId:req.session.user.id, action:"CREATE_FACILITY", entityType:"room", entityId:created[0]?.id || null, details:`Created facility ${name.trim()}`, req });
      req.flash("success", "Facility added successfully.");
    }
    res.redirect("/admin/rooms");
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") req.flash("error", "A facility with that name already exists.");
    else return next(err);
    res.redirect(req.body.id ? `/admin/rooms/${req.body.id}/edit` : "/admin/rooms/new");
  }
});

router.post("/rooms/:id/status", async (req, res, next) => {
  try {
    const status = ["Available", "Unavailable", "Maintenance"].includes(req.body.status) ? req.body.status : "Unavailable";
    await db.execute(`UPDATE rooms SET status=? WHERE id=?`, [status, req.params.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"CHANGE_FACILITY_STATUS", entityType:"room", entityId:req.params.id, details:`Changed facility status to ${status}`, req });
    req.flash("success", `Facility status changed to ${status}.`);
    res.redirect("/admin/rooms");
  } catch (err) { next(err); }
});

router.get("/users", async (req, res, next) => {
  try {
    const [users] = await db.execute(`SELECT id, school_id, full_name, email, role, status, created_at FROM users ORDER BY created_at DESC`);
    res.render("admin/users", { title: "Manage Users", users });
  } catch (err) { next(err); }
});

router.post("/users/:id/status", async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.session.user.id) {
      req.flash("error", "You cannot deactivate your own admin account.");
      return res.redirect("/admin/users");
    }
    const status = ["Active", "Inactive", "Pending"].includes(req.body.status) ? req.body.status : "Inactive";
    await db.execute(`UPDATE users SET status=? WHERE id=?`, [status, req.params.id]);
    await writeAudit(db, { userId:req.session.user.id, action:"CHANGE_USER_STATUS", entityType:"user", entityId:req.params.id, details:`Changed user status to ${status}`, req });
    req.flash("success", `User status changed to ${status}.`);
    res.redirect("/admin/users");
  } catch (err) { next(err); }
});

router.get("/reports", async (req, res, next) => {
  try {
    const [[summary]] = await db.execute(`
      SELECT COUNT(*) total,
             SUM(status='Pending') pending,
             SUM(status='Approved') approved,
             SUM(status='Rejected') rejected,
             SUM(status='Cancelled') cancelled,
             SUM(status='Completed') completed
      FROM reservations
    `);
    const [byFacility] = await db.execute(`
      SELECT rm.name, rm.type, COUNT(r.id) reservations
      FROM rooms rm LEFT JOIN reservations r ON r.room_id=rm.id
      GROUP BY rm.id, rm.name, rm.type ORDER BY reservations DESC, rm.name
    `);
    const [byPurpose] = await db.execute(`SELECT purpose, COUNT(*) total FROM reservations GROUP BY purpose ORDER BY total DESC`);
    res.render("admin/reports", { title: "Reports", summary, byFacility, byPurpose });
  } catch (err) { next(err); }
});

module.exports = router;

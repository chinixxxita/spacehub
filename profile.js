const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, school_id, full_name, email, role, status, program, year_level,
              section, department, position, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [req.session.user.id]
    );
    if (!rows.length) return res.redirect("/login");
    res.render("profile/index", { title: "My Profile", profile: rows[0] });
  } catch (err) { next(err); }
});

router.post("/profile", requireAuth, async (req, res, next) => {
  try {
    const { full_name, email, program, year_level, section, department, position } = req.body;
    if (!full_name?.trim() || !email?.trim()) {
      req.flash("error", "Full name and email are required.");
      return res.redirect("/profile");
    }

    const [existing] = await db.execute(
      "SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1",
      [email.trim(), req.session.user.id]
    );
    if (existing.length) {
      req.flash("error", "That email address is already in use.");
      return res.redirect("/profile");
    }

    await db.execute(
      `UPDATE users SET full_name = ?, email = ?, program = ?, year_level = ?,
       section = ?, department = ?, position = ? WHERE id = ?`,
      [full_name.trim(), email.trim(), program?.trim() || null, year_level?.trim() || null,
       section?.trim() || null, department?.trim() || null, position?.trim() || null,
       req.session.user.id]
    );

    req.session.user.full_name = full_name.trim();
    req.session.user.email = email.trim();
    req.flash("success", "Profile updated successfully.");
    res.redirect("/profile");
  } catch (err) { next(err); }
});

router.get("/settings", requireAuth, async (req, res, next) => {
  try {
    const [[settings]] = await db.execute(
      `SELECT email_notifications, reservation_updates FROM user_settings WHERE user_id = ?`,
      [req.session.user.id]
    );
    res.render("profile/settings", {
      title: "Settings",
      settings: settings || { email_notifications: 1, reservation_updates: 1 }
    });
  } catch (err) { next(err); }
});

router.post("/settings", requireAuth, async (req, res, next) => {
  try {
    const emailNotifications = req.body.email_notifications === "on" ? 1 : 0;
    const reservationUpdates = req.body.reservation_updates === "on" ? 1 : 0;
    await db.execute(
      `INSERT INTO user_settings (user_id, email_notifications, reservation_updates)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE email_notifications = VALUES(email_notifications),
       reservation_updates = VALUES(reservation_updates)`,
      [req.session.user.id, emailNotifications, reservationUpdates]
    );
    req.flash("success", "Settings saved.");
    res.redirect("/settings");
  } catch (err) { next(err); }
});

router.get("/security", requireAuth, (req, res) => {
  res.render("profile/security", { title: "Security" });
});

router.post("/security/password", requireAuth, async (req, res, next) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;
    if (!current_password || !new_password || !confirm_password) {
      req.flash("error", "Please complete all password fields.");
      return res.redirect("/security");
    }
    if (new_password.length < 8) {
      req.flash("error", "New password must contain at least 8 characters.");
      return res.redirect("/security");
    }
    if (new_password !== confirm_password) {
      req.flash("error", "New passwords do not match.");
      return res.redirect("/security");
    }

    const [[user]] = await db.execute(
      "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
      [req.session.user.id]
    );
    if (!user || !(await bcrypt.compare(current_password, user.password_hash))) {
      req.flash("error", "Current password is incorrect.");
      return res.redirect("/security");
    }

    const hash = await bcrypt.hash(new_password, 12);
    await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.session.user.id]);
    req.flash("success", "Password changed successfully.");
    res.redirect("/security");
  } catch (err) { next(err); }
});

module.exports = router;

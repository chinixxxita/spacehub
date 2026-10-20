const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/notifications", async (req, res, next) => {
  try {
    const [notifications] = await db.execute(
      `SELECT id, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.session.user.id]
    );

    res.render("notifications/index", {
      title: "Notifications",
      notifications
    });
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/:id/read", async (req, res, next) => {
  try {
    await db.execute(
      `UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?`,
      [req.params.id, req.session.user.id]
    );
    res.redirect(req.get("referer") || "/notifications");
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/read-all", async (req, res, next) => {
  try {
    await db.execute(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = ?`,
      [req.session.user.id]
    );
    req.flash("success", "All notifications marked as read.");
    res.redirect("/notifications");
  } catch (err) {
    next(err);
  }
});

module.exports = router;

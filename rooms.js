const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const [rooms] = await db.execute(
      `SELECT id, name, type, building, floor, capacity,
              air_conditioned, has_computers, computer_count, description, status
       FROM rooms
       WHERE status = 'Available'
       ORDER BY type, name`
    );

    res.render("rooms/index", { title: "Rooms & Laboratories", rooms });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
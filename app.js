require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const expressLayouts = require("express-ejs-layouts");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const roomRoutes = require("./routes/rooms");
const reservationRoutes = require("./routes/reservations");
const adminRoutes = require("./routes/admin");
const notificationRoutes = require("./routes/notifications");
const calendarRoutes = require("./routes/calendar");
const profileRoutes = require("./routes/profile");
const db = require("./config/db");

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("Production requires a SESSION_SECRET of at least 32 characters.");
}

async function ensureAccountSchema() {
  // Schema changes should normally be applied by a DBA/deployment step, not by
  // the application's least-privileged database account. Set AUTO_MIGRATE=true
  // only for local development when the DB user is allowed to alter the schema.
  if (process.env.AUTO_MIGRATE !== "true") return;

  await db.execute(`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS program VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS year_level VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS section VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS department VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS position VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS terms_accepted_at DATETIME NULL`);

  await db.execute(`CREATE TABLE IF NOT EXISTS user_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    reservation_updates BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS facility_maintenance (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id INT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
    created_by INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_maintenance_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_maintenance_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_maintenance_room_dates (room_id, start_date, end_date, status),
    INDEX idx_maintenance_dates (start_date, end_date, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(64) NULL,
    details TEXT NULL,
    ip_address VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_user (user_id, created_at),
    INDEX idx_audit_entity (entity_type, entity_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));

// Baseline browser protections. These do not replace authorization or input validation.
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(flash());

app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.unreadNotifications = 0;

  if (req.session.user) {
    try {
      const [[row]] = await db.execute(
        `SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE`,
        [req.session.user.id]
      );
      res.locals.unreadNotifications = Number(row.unread || 0);
    } catch (err) {
      // Notification count should never prevent the rest of the application from loading.
      console.error("Notification count error:", err.message);
    }
  }
  next();
});

app.get("/", async (req, res, next) => {
  if (req.session.user) return res.redirect("/dashboard");
  try {
    const [rooms] = await db.execute(
      `SELECT name, type, capacity FROM rooms WHERE status = 'Available' ORDER BY type, name LIMIT 4`
    );
    res.render("landing", { title: "CSPC SpaceHub", rooms, isLanding: true });
  } catch (err) {
    next(err);
  }
});

app.use("/", authRoutes);
app.use("/", dashboardRoutes);
app.use("/rooms", roomRoutes);
app.use("/reservations", reservationRoutes);
app.use("/calendar", calendarRoutes);
app.use("/", notificationRoutes);
app.use("/admin", adminRoutes);
app.use("/", profileRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404", { title: "Page Not Found" });
});

function describeError(err) {
  const isConnectionError =
    err && (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "PROTOCOL_CONNECTION_LOST" ||
            (typeof AggregateError !== "undefined" && err instanceof AggregateError));
  if (isConnectionError) {
    return "The database could not be reached. Make sure MySQL is running, then refresh this page.";
  }
  if (err && err.code === "ER_NO_SUCH_TABLE") {
    return "A database table is missing. Run database/schema.sql and the files in database/migrations.";
  }
  return (err && (err.message || err.code)) || "An unexpected error occurred.";
}

app.use((err, req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    console.error("Unhandled application error:", err && (err.message || err.code));
  } else {
    console.error(err);
  }
  res.status(500).render("errors/500", {
    title: "Server Error",
    message: process.env.NODE_ENV === "production"
      ? "Something went wrong."
      : describeError(err)
  });
});

ensureAccountSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CSPC SpaceHub listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database setup error:", err.message);
    process.exit(1);
  });
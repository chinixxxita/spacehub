const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { loginLimiter, registrationLimiter } = require("../middleware/rateLimiter");
const { writeAudit } = require("../utils/audit");

const router = express.Router();

router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.render("auth/login", { title: "Login", form: { school_id: "" } });
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const schoolId = String(req.body.school_id || "").trim();
    const password = String(req.body.password || "");
    const form = { school_id: schoolId };

    if (!schoolId || !password) {
      req.flash("error", "Please enter your School ID and password.");
      return res.status(400).render("auth/login", { title: "Login", form });
    }

    const [rows] = await db.execute(
      "SELECT id, school_id, full_name, email, password_hash, role, status FROM users WHERE school_id = ? LIMIT 1",
      [schoolId]
    );

    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      req.flash("error", "Invalid School ID or password. Please check your credentials and try again.");
      return res.status(401).render("auth/login", { title: "Login", form });
    }

    if (rows[0].status !== "Active") {
      req.flash("error", "Your account is not active. Please contact the administrator.");
      return res.status(403).render("auth/login", { title: "Login", form });
    }

    const user = rows[0];
    delete user.password_hash;

    req.session.regenerate((sessionErr) => {
      if (sessionErr) return next(sessionErr);
      req.session.user = user;
      writeAudit(db, {
        userId: user.id,
        action: "LOGIN",
        entityType: "user",
        entityId: user.id,
        details: "Successful login",
        req
      }).catch(auditErr => console.error("Audit login error:", auditErr.message));
      req.flash("success", `Welcome, ${user.full_name}!`);
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.redirect("/dashboard");
      });
    });
  } catch (err) {
    next(err);
  }
});

router.get("/terms", (req, res) => {
  res.render("auth/terms", { title: "Terms and Conditions" });
});

router.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.render("auth/register", {
    title: "Create Account",
    form: {
      school_id: "",
      full_name: "",
      email: "",
      role: "student",
      terms_accepted: false
    }
  });
});

router.post("/register", registrationLimiter, async (req, res, next) => {
  try {
    const schoolId = String(req.body.school_id || "").trim();
    const fullName = String(req.body.full_name || "").trim();
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirm_password || "");
    const role = req.body.role === "faculty" ? "faculty" : "student";
    const termsAccepted = req.body.terms_accepted === "on";

    // Never send passwords back to the browser after an error.
    const form = {
      school_id: schoolId,
      full_name: fullName,
      email,
      role,
      terms_accepted: termsAccepted
    };

    const renderError = (message, status = 400) => {
      req.flash("error", message);
      return res.status(status).render("auth/register", { title: "Create Account", form });
    };

    if (!schoolId || !fullName || !email || !password || !confirmPassword || !termsAccepted) {
      return renderError("Please complete all required fields and accept the Terms and Conditions.");
    }

    if (password !== confirmPassword) {
      return renderError("Passwords do not match. Please enter the same password in both fields.");
    }

    const [existing] = await db.execute(
      "SELECT id FROM users WHERE school_id = ? OR email = ? LIMIT 1",
      [schoolId, email]
    );

    if (existing.length) {
      return renderError("School ID or email is already registered. Please use your existing account or another email.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.execute(
      `INSERT INTO users
       (school_id, full_name, email, password_hash, role, status, terms_accepted_at)
       VALUES (?, ?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP)`,
      [schoolId, fullName, email, passwordHash, role]
    );

    req.flash("success", "Account created successfully. You may now log in.");
    res.redirect("/login");
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

module.exports = router;

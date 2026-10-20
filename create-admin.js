require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../config/db");

(async () => {
  const [schoolId, fullName, email, password] = process.argv.slice(2);
  if (!schoolId || !fullName || !email || !password) {
    console.log('Usage: node scripts/create-admin.js "ADMIN001" "SpaceHub Administrator" "admin@cspc.edu.ph" "YourPassword"');
    process.exit(1);
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await db.execute(`
      INSERT INTO users (school_id, full_name, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, 'admin', 'Active')
      ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), email=VALUES(email), password_hash=VALUES(password_hash), role='admin', status='Active'
    `, [schoolId, fullName, email, hash]);
    console.log(`Admin account ready for ${schoolId}.`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally { await db.end(); }
})();

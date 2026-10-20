async function writeAudit(dbOrConnection, { userId = null, action, entityType, entityId = null, details = null, req = null }) {
  const ip = req ? String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 64) : null;
  await dbOrConnection.execute(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, action, entityType, entityId, details, ip]
  );
}
module.exports = { writeAudit };

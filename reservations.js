const express = require("express");
const db = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { apiLimiter, reservationWriteLimiter } = require("../middleware/rateLimiter");
const { writeAudit } = require("../utils/audit");
const router = express.Router();

// Reservation requests are for students and faculty/instructors.
const reservationRequesterOnly = requireRole("student", "faculty");
router.use(reservationRequesterOnly);

const PURPOSES = {
  student: ["Group Project / Group Work","Research Activity","Student Organization Activity","Presentation / Preparation","Meeting / Discussion","Other"],
  faculty: ["Class / Lecture","Laboratory Activity","Computer-Based Examination","Student Consultation","Academic Advising","Faculty / Department Meeting","Seminar / Training","Other"],
};
// Reservations are available continuously from 7:00 AM to 7:00 PM.
// Start and end times may be selected in 15-minute increments (for example 10:15 AM to 1:45 PM).
// To change the operating hours, edit OPEN_HOUR and CLOSE_HOUR only.
const OPEN_HOUR = 7;
const CLOSE_HOUR = 19;
const OPEN_MINUTES = OPEN_HOUR * 60;
const CLOSE_MINUTES = CLOSE_HOUR * 60;
const SLOT_MINUTES = 15;
const hhmm = (h) => `${String(h).padStart(2, "0")}:00`;
const OPEN_TIME = hhmm(OPEN_HOUR);
const CLOSE_TIME = hhmm(CLOSE_HOUR);
const OPERATING_RANGES = [[OPEN_TIME, CLOSE_TIME]];

// Booking limits
const MAX_USERS_PER_BOOKING = 50;   // hard cap for one reservation
const COMPUTERS_AVAILABLE = 50;     // shown to users who book a laboratory

// Date helpers use the server's local time (not UTC), so "today" and "already started"
// are correct for Philippine time even early in the morning.
const pad2 = (n) => String(n).padStart(2, "0");
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function dateKey(value) {
  return value instanceof Date ? localDateStr(value) : String(value).slice(0, 10);
}
function hasStarted(dateValue, startTime) {
  const time = String(startTime || "00:00").slice(0, 5);
  return new Date(`${dateKey(dateValue)}T${time}:00`) <= new Date();
}

function validDate(v){ if(!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const [y,m,d]=v.split('-').map(Number); const dt=new Date(y,m-1,d); return dt.getFullYear()===y && dt.getMonth()===m-1 && dt.getDate()===d; }
function mins(t){ if(!/^\d{2}:\d{2}$/.test(String(t||""))) return NaN; const [h,m]=String(t).split(":").map(Number); return h*60+m; }
function validTimeRange(start,end){
  const a=mins(start), b=mins(end);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b) return false;
  return OPERATING_RANGES.some(([open,close]) => {
    const o=mins(open), c=mins(close);
    return a>=o && b<=c && (a-o)%SLOT_MINUTES===0 && (b-o)%SLOT_MINUTES===0;
  });
}
function ref(){ return `SPH-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.floor(100+Math.random()*900)}`; }

async function conflicts(roomId,date,start,end){
  const [rows]=await db.execute(`SELECT id,reference_no,start_time,end_time FROM reservations WHERE room_id=? AND reservation_date=? AND status IN ('Pending','Approved') AND start_time<? AND end_time>? ORDER BY start_time`,[roomId,date,end,start]);
  return rows;
}

async function maintenanceConflict(roomId, date, start = OPEN_TIME, end = CLOSE_TIME, connection = db) {
  const startDateTime = `${date} ${start}:00`;
  const endDateTime = `${date} ${end}:00`;
  const [rows] = await connection.execute(
    `SELECT id, reason, start_date, end_date
     FROM facility_maintenance
     WHERE room_id=? AND status='Scheduled'
       AND start_date < ? AND end_date > ?
     ORDER BY start_date LIMIT 1`,
    [roomId, endDateTime, startDateTime]
  );
  return rows[0] || null;
}
function makeBlocks(rows, maintenanceRows = []) {
  const blocks = [];
  for (let t = OPEN_MINUTES; t < CLOSE_MINUTES; t += SLOT_MINUTES) {
    const e = t + SLOT_MINUTES;
    const start = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
    const end = `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;
    const reserved = rows.some(r => String(r.start_time).slice(0,5) < end && String(r.end_time).slice(0,5) > start);
    const maintained = maintenanceRows.some(m => {
      const ms = String(m.start_date).slice(0,16).replace(' ','T');
      const me = String(m.end_date).slice(0,16).replace(' ','T');
      const ds = `${m.date_key}T${start}:00`;
      const de = `${m.date_key}T${end}:00`;
      return ms < de && me > ds;
    });
    blocks.push({ start, end, status: reserved ? 'Booked' : maintained ? 'Maintenance' : 'Available' });
  }
  return blocks;
}

router.get("/new",async(req,res,next)=>{
  try{
    const [rooms]=await db.execute(`SELECT id,name,type,building,floor,capacity,air_conditioned,has_computers,computer_count,description FROM rooms WHERE status='Available' ORDER BY type,name`);
    const form = req.session.reservationDraft || {};
    delete req.session.reservationDraft;
    res.render("reservations/new",{title:"Make Reservation",rooms,purposes:PURPOSES[req.session.user.role]||PURPOSES.student,form,maxUsers:MAX_USERS_PER_BOOKING,computersAvailable:COMPUTERS_AVAILABLE});
  }catch(e){next(e)}
});

router.get("/availability", apiLimiter, async(req,res,next)=>{
  try{
    const {room_id,date}=req.query;
    if(!room_id||!validDate(date)) return res.status(400).json({error:"A valid facility and date are required."});
    const [rooms]=await db.execute(`SELECT id,name,type,capacity,air_conditioned,has_computers,computer_count,status FROM rooms WHERE id=? LIMIT 1`,[room_id]);
    if(!rooms.length) return res.status(404).json({error:"Facility not found."});
    const [rows]=await db.execute(`SELECT start_time,end_time FROM reservations WHERE room_id=? AND reservation_date=? AND status IN ('Pending','Approved') ORDER BY start_time`,[room_id,date]);
    const [maintenanceRows]=await db.execute(`SELECT id,reason,DATE_FORMAT(start_date,'%Y-%m-%d %H:%i:%s') AS start_date,DATE_FORMAT(end_date,'%Y-%m-%d %H:%i:%s') AS end_date FROM facility_maintenance WHERE room_id=? AND status='Scheduled' AND start_date < ? AND end_date > ? ORDER BY start_date`,[room_id,`${date} ${CLOSE_TIME}:00`,`${date} ${OPEN_TIME}:00`]);
    const blocks = makeBlocks(rows, maintenanceRows.map(m=>({...m,date_key:date})));
    if (date === localDateStr()) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      blocks.forEach((b) => { if (b.status === 'Available' && mins(b.start) <= nowMinutes) b.status = 'Past'; });
    }
    const maintenance = maintenanceRows[0] || null;
    res.json({room:rooms[0],blocks,maintenance,limits:{maxUsers:MAX_USERS_PER_BOOKING,computers:COMPUTERS_AVAILABLE}});
  }catch(e){next(e)}
});

router.post("/review", reservationWriteLimiter, async(req,res,next)=>{
  try{
    const {room_id,reservation_date,start_time,end_time,purpose,purpose_details,number_of_users}=req.body;
    const extra_chairs=String(req.body.extra_chairs||"");
    req.session.reservationDraft = { room_id, reservation_date, start_time, end_time, purpose, purpose_details, number_of_users, extra_chairs };
    if(!room_id||!reservation_date||!start_time||!end_time||!purpose||!purpose_details||!number_of_users){req.flash("error","Please complete all required fields.");return res.redirect("/reservations/new");}
    if(!validDate(reservation_date)||reservation_date<localDateStr()){req.flash("error","Please choose a valid reservation date.");return res.redirect("/reservations/new");}
    if(!validTimeRange(start_time,end_time)){req.flash("error","Please select a valid start and end time within the available operating hours.");return res.redirect("/reservations/new");}
    if(hasStarted(reservation_date,start_time)){req.flash("error","That start time has already passed. Please choose a later time.");return res.redirect("/reservations/new");}
    const [rooms]=await db.execute(`SELECT id,name,type,capacity,air_conditioned,has_computers,computer_count,description,status FROM rooms WHERE id=? LIMIT 1`,[room_id]);
    if(!rooms.length||rooms[0].status!=="Available"){req.flash("error","The selected facility is not available.");return res.redirect("/reservations/new");}
    const room=rooms[0];
    const maintenance = await maintenanceConflict(room_id, reservation_date, start_time, end_time);
    if (maintenance) { req.flash("error", `The facility is scheduled for maintenance on the selected date: ${maintenance.reason}`); return res.redirect("/reservations/new"); }
    const users=Number(number_of_users);
    if(!Number.isInteger(users)||users<1||users>MAX_USERS_PER_BOOKING){req.flash("error",`Number of users must be between 1 and ${MAX_USERS_PER_BOOKING}.`);return res.redirect("/reservations/new");}
    const overCapacity=users>room.capacity;
    if(overCapacity&&!["Yes","No"].includes(extra_chairs)){req.flash("error",`Your group is larger than this facility's capacity of ${room.capacity}. Please tell us whether you want additional chairs.`);return res.redirect("/reservations/new");}
    if(req.session.user.role==="student"&&room.type==="Laboratory"){req.flash("error","Students cannot directly reserve laboratories. An authorized instructor must make the laboratory reservation.");return res.redirect("/reservations/new");}
    const purposes=PURPOSES[req.session.user.role]||PURPOSES.student;
    if(!purposes.includes(purpose)){req.flash("error","The selected purpose is not valid for your account type.");return res.redirect("/reservations/new");}
    if((await conflicts(room_id,reservation_date,start_time,end_time)).length){req.flash("error","That time overlaps an existing reservation.");return res.redirect("/reservations/new");}
    delete req.session.reservationDraft;
    res.render("reservations/review",{title:"Review Reservation",reservation:{room_id,reservation_date,start_time,end_time,purpose,purpose_details:purpose_details.trim(),number_of_users:users,extra_chairs:overCapacity?extra_chairs:""},room,computersAvailable:COMPUTERS_AVAILABLE});
  }catch(e){next(e)}
});

router.post("/submit", reservationWriteLimiter, async(req,res,next)=>{
  const c=await db.getConnection();
  try{
    const {room_id,reservation_date,start_time,end_time,purpose,purpose_details,number_of_users}=req.body;
    const extra_chairs=String(req.body.extra_chairs||"");
    req.session.reservationDraft = { room_id, reservation_date, start_time, end_time, purpose, purpose_details, number_of_users, extra_chairs };
    if(!room_id||!reservation_date||!start_time||!end_time||!purpose||!purpose_details||!number_of_users){req.flash("error","Incomplete reservation data.");return res.redirect("/reservations/new");}
    if(!validDate(reservation_date)||reservation_date<localDateStr()||!validTimeRange(start_time,end_time)){req.flash("error","The reservation date or time range is invalid.");return res.redirect("/reservations/new");}
    if(hasStarted(reservation_date,start_time)){req.flash("error","That start time has already passed. Please choose a later time.");return res.redirect("/reservations/new");}
    if(String(purpose_details).trim().length<5||String(purpose_details).trim().length>1000){req.flash("error","Purpose details must be between 5 and 1000 characters.");return res.redirect("/reservations/new");}
    await c.beginTransaction();
    const [rooms]=await c.execute(`SELECT id,capacity,type,status FROM rooms WHERE id=? LIMIT 1`,[room_id]);
    if(!rooms.length||rooms[0].status!=="Available"){await c.rollback();req.flash("error","The selected facility is no longer available.");return res.redirect("/reservations/new");}
    const room=rooms[0];
    const maintenance = await maintenanceConflict(room_id, reservation_date, start_time, end_time, c);
    if (maintenance) { await c.rollback(); req.flash("error", `The facility is scheduled for maintenance on the selected date: ${maintenance.reason}`); return res.redirect("/reservations/new"); }
    const users=Number(number_of_users);
    if(!Number.isInteger(users)||users<1||users>MAX_USERS_PER_BOOKING){await c.rollback();req.flash("error",`Number of users must be between 1 and ${MAX_USERS_PER_BOOKING}.`);return res.redirect("/reservations/new");}
    const overCapacity=users>room.capacity;
    if(overCapacity&&!["Yes","No"].includes(extra_chairs)){await c.rollback();req.flash("error",`Your group is larger than this facility's capacity of ${room.capacity}. Please tell us whether you want additional chairs.`);return res.redirect("/reservations/new");}
    let finalDetails=String(purpose_details).trim();
    if(overCapacity){
      const extra=users-room.capacity;
      finalDetails+=`\n\n[Additional chairs] ${extra_chairs==="Yes"?`Requested for ${extra} extra ${extra===1?"person":"people"} (facility capacity: ${room.capacity}).`:`Not requested. Group exceeds the facility capacity of ${room.capacity}.`}`;
    }
    if(req.session.user.role==="student"&&room.type==="Laboratory"){await c.rollback();req.flash("error","Students cannot directly reserve laboratories.");return res.redirect("/reservations/new");}
    const [conflictRows]=await c.execute(`SELECT id FROM reservations WHERE room_id=? AND reservation_date=? AND status IN ('Pending','Approved') AND start_time<? AND end_time>? LIMIT 1 FOR UPDATE`,[room_id,reservation_date,end_time,start_time]);
    if(conflictRows.length){await c.rollback();req.flash("error","That time was just reserved by another user. Please choose another time.");return res.redirect("/reservations/new");}
    const referenceNo=ref();
    const [reservationInsert] = await c.execute(`INSERT INTO reservations(reference_no,user_id,room_id,reservation_date,start_time,end_time,purpose,purpose_details,number_of_users,status) VALUES(?,?,?,?,?,?,?,?,?,'Pending')`,[referenceNo,req.session.user.id,room_id,reservation_date,start_time,end_time,purpose,finalDetails,users]);
    await writeAudit(c, { userId:req.session.user.id, action:"SUBMIT_RESERVATION", entityType:"reservation", entityId:reservationInsert.insertId, details:`Submitted ${referenceNo} for room ${room_id} on ${reservation_date} ${start_time}-${end_time}`, req });

    // Notify every active administrator that a new reservation needs review.
    const [admins] = await c.execute(`SELECT id FROM users WHERE role='admin' AND status='Active'`);
    const [requesterRows] = await c.execute(`SELECT full_name FROM users WHERE id=? LIMIT 1`, [req.session.user.id]);
    const requesterName = requesterRows[0]?.full_name || 'A user';
    const [roomRows] = await c.execute(`SELECT name FROM rooms WHERE id=? LIMIT 1`, [room_id]);
    const roomName = roomRows[0]?.name || 'the selected facility';
    for (const admin of admins) {
      await c.execute(
        `INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`,
        [admin.id, 'New Reservation Request', `${requesterName} submitted reservation ${referenceNo} for ${roomName} on ${reservation_date} from ${start_time} to ${end_time}.`]
      );
    }

    await c.commit();
    delete req.session.reservationDraft;
    req.flash("success",`Reservation ${referenceNo} submitted for approval.`);
    res.redirect(`/reservations/success?reference=${encodeURIComponent(referenceNo)}`);
  }catch(e){try{await c.rollback()}catch{} next(e)}finally{c.release()}
});

router.post("/:id/cancel", requireAuth, async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT r.id, r.reference_no, r.user_id, r.status, r.reservation_date, r.start_time,
              rm.name AS room_name
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       WHERE r.id = ? AND r.user_id = ?
       LIMIT 1`,
      [req.params.id, req.session.user.id]
    );
    if (!rows.length) {
      await connection.rollback();
      req.flash("error", "Reservation not found.");
      return res.redirect("/reservations/my");
    }
    const r = rows[0];
    if (!["Pending", "Approved"].includes(r.status)) {
      await connection.rollback();
      req.flash("error", "Only Pending or Approved reservations can be cancelled.");
      return res.redirect("/reservations/my");
    }
    if (hasStarted(r.reservation_date, r.start_time)) {
      await connection.rollback();
      req.flash("error", "This reservation has already started or passed, so it can no longer be cancelled.");
      return res.redirect("/reservations/my");
    }
    await connection.execute(
      `UPDATE reservations SET status='Cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [r.id]
    );
    await writeAudit(connection, { userId:req.session.user.id, action:"CANCEL_RESERVATION", entityType:"reservation", entityId:r.id, details:`Cancelled ${r.reference_no}`, req });
    const [admins] = await connection.execute(
      `SELECT id FROM users WHERE role='admin' AND status='Active'`
    );
    for (const admin of admins) {
      await connection.execute(
        `INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`,
        [admin.id, "Reservation Cancelled", `Reservation ${r.reference_no} for ${r.room_name} was cancelled by the requester.`]
      );
    }
    await connection.commit();
    req.flash("success", `Reservation ${r.reference_no} has been cancelled.`);
    res.redirect("/reservations/my");
  } catch (err) {
    try { await connection.rollback(); } catch {}
    next(err);
  } finally { connection.release(); }
});

router.get("/success",(req,res)=>res.render("reservations/success",{title:"Reservation Submitted",reference:req.query.reference||""}));
router.get("/my",async(req,res,next)=>{try{const [reservations]=await db.execute(`SELECT r.*,rm.name room_name,rm.type room_type FROM reservations r JOIN rooms rm ON rm.id=r.room_id WHERE r.user_id=? ORDER BY r.reservation_date DESC,r.start_time DESC`,[req.session.user.id]);res.render("reservations/my",{title:"My Reservations",reservations:reservations.map(r=>({...r,can_cancel:["Pending","Approved"].includes(r.status)&&!hasStarted(r.reservation_date,r.start_time)}))})}catch(e){next(e)}});
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT r.*, rm.name AS room_name, rm.type AS room_type, rm.building, rm.floor,
             rm.capacity, rm.air_conditioned, rm.has_computers, rm.computer_count
      FROM reservations r
      JOIN rooms rm ON rm.id = r.room_id
      WHERE r.id = ? AND r.user_id = ?
      LIMIT 1
    `, [req.params.id, req.session.user.id]);
    if (!rows.length) return res.status(404).render("errors/404", { title: "Reservation Not Found" });
    res.render("reservations/detail", { title: "Reservation Details", reservation: { ...rows[0], can_cancel: ["Pending","Approved"].includes(rows[0].status) && !hasStarted(rows[0].reservation_date, rows[0].start_time) } });
  } catch (err) { next(err); }
});

module.exports=router;

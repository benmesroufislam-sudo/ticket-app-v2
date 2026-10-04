
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database('tickets_system.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. تهيئة قاعدة البيانات والتجداول ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'agent', 'requester')) DEFAULT 'requester',
    email TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT CHECK(category IN ('incident', 'request', 'problem', 'change')) DEFAULT 'incident',
    priority TEXT CHECK(priority IN ('P1', 'P2', 'P3', 'P4')) DEFAULT 'P3',
    status TEXT CHECK(status IN ('new', 'in_progress', 'pending', 'resolved', 'closed')) DEFAULT 'new',
    created_by INTEGER,
    assigned_to INTEGER,
    sla_due_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id),
    FOREIGN KEY(assigned_to) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ticket_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// إضافة مستخدمين تجريبيين في حال كانت القاعدة فارغة
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const insertUser = db.prepare('INSERT INTO users (name, role, email) VALUES (?, ?, ?)');
  insertUser.run('مدير النظام', 'admin', 'admin@company.com');
  insertUser.run('مهندس دعم - إسلام', 'agent', 'islam.agent@company.com');
  insertUser.run('موظف - أحمد', 'requester', 'ahmed.user@company.com');
}

// --- 2. دوال مساعدة لحساب SLA ---
function calculateSLA(priority) {
  const hoursMap = { P1: 2, P2: 8, P3: 24, P4: 72 };
  const hours = hoursMap[priority] || 24;
  const dueDate = new Date();
  dueDate.setHours(dueDate.getHours() + hours);
  return dueDate.toISOString();
}

// --- 3. مسارات البرمجة (API Endpoints) ---

// جلب الإحصائيات العامة
app.get('/api/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_tickets,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'resolved' OR status = 'closed' THEN 1 ELSE 0 END) as closed
    FROM tickets
  `).get();
  res.json(stats);
});

// جلب قائمة التذاكر
app.get('/api/tickets', (req, res) => {
  const tickets = db.prepare(`
    SELECT t.*, u1.name as creator_name, u2.name as agent_name 
    FROM tickets t
    LEFT JOIN users u1 ON t.created_by = u1.id
    LEFT JOIN users u2 ON t.assigned_to = u2.id
    ORDER BY t.created_at DESC
  `).all();
  res.json(tickets);
});

// جلب تفاصيل تذكرة مع تعليقاتها
app.get('/api/tickets/:id', (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, u1.name as creator_name, u2.name as agent_name 
    FROM tickets t
    LEFT JOIN users u1 ON t.created_by = u1.id
    LEFT JOIN users u2 ON t.assigned_to = u2.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });

  const comments = db.prepare(`
    SELECT c.*, u.name as author_name 
    FROM ticket_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.ticket_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json({ ticket, comments });
});

// إنشاء تذكرة جديدة
app.post('/api/tickets', (req, res) => {
  const { title, description, category, priority, created_by } = req.body;
  const sla_due_at = calculateSLA(priority);

  const stmt = db.prepare(`
    INSERT INTO tickets (title, description, category, priority, created_by, sla_due_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(title, description, category, priority, created_by || 3, sla_due_at);
  res.json({ success: true, ticketId: result.lastInsertRowid });
});

// تحديث حالة أو تعيين التذكرة
app.patch('/api/tickets/:id', (req, res) => {
  const { status, assigned_to } = req.body;
  const updates = [];
  const params = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
  }
  if (assigned_to !== undefined) {
    updates.push('assigned_to = ?');
    params.push(assigned_to);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });

  params.push(req.params.id);
  const stmt = db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);
  res.json({ success: true });
});

// إضافة تعليق على تذكرة
app.post('/api/tickets/:id/comments', (req, res) => {
  const { comment, user_id } = req.body;
  const stmt = db.prepare(`
    INSERT INTO ticket_comments (ticket_id, user_id, comment)
    VALUES (?, ?, ?)
  `);
  stmt.run(req.params.id, user_id || 2, comment);
  res.json({ success: true });
});

// جلب قائمة المستخدمين
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, name, role FROM users').all();
  res.json(users);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`نظام التيكت يعمل بنجاح على الرابط: http://localhost:${PORT}`);
});
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// كلمة مرور لوحة التحكم (يمكنك تغييرها من هنا)
const ADMIN_PASSWORD = "admin"; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات
const dbPath = path.join(__dirname, 'tickets.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('خطأ في قاعدة البيانات:', err.message);
    else console.log('تم الاتصال بقاعدة البيانات SQLite.');
});

// إنشاء الجدول
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            priority TEXT DEFAULT 'P3',
            created_by TEXT NOT NULL,
            status TEXT DEFAULT 'جديدة',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// API التحقق من كلمة مرور المدير
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: "admin-authenticated-token" });
    } else {
        res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
    }
});

// API جلب التذاكر (محمية بكلمة المرور)
app.post('/api/admin/tickets', (req, res) => {
    const { token } = req.body;
    if (token !== "admin-authenticated-token") {
        return res.status(403).json({ error: "غير مصرح لك بالوصول" });
    }
    db.all(`SELECT * FROM tickets ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API إنشاء تذكرة جديدة (متاحة للموظفين)
app.post('/api/tickets', (req, res) => {
    const { title, priority, created_by } = req.body;
    if (!created_by || !created_by.trim() || !title || !title.trim()) {
        return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    const sql = `INSERT INTO tickets (title, priority, created_by, status, created_at) VALUES (?, ?, ?, 'جديدة', DATETIME('now', 'localtime'))`;
    db.run(sql, [title.trim(), priority || 'P3', created_by.trim()], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'تم إرسال التذكرة بنجاح' });
    });
});

// API تحديث حالة التذكرة
app.post('/api/admin/tickets/status', (req, res) => {
    const { token, id, status } = req.body;
    if (token !== "admin-authenticated-token") {
        return res.status(403).json({ error: "غير مصرح" });
    }
    db.run(`UPDATE tickets SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "تم تحديث الحالة" });
    });
});

// توجيه الواجهات
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ: ${PORT}`);
});
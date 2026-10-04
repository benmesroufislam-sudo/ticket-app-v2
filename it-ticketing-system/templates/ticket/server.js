const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();

// إعداد المنفذ ديناميكياً ليتوافق مع Render والتطوير المحلي
const PORT = process.env.PORT || 3000;

// Middleware لمعالجة بيانات JSON والنموذج
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// خدمة الملفات الثابتة (مثل index.html، الصور، والملفات المرفقة)
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات SQLite
const dbPath = path.join(__dirname, 'tickets.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('خطأ في الاتصال بقاعدة البيانات:', err.message);
    } else {
        console.log('تم الاتصال بقاعدة البيانات SQLite بنجاح.');
    }
});

// إنشاء جدول التذاكر إذا لم يكن موجوداً
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

// API: جلب جميع التذاكر
app.get('/api/tickets', (req, res) => {
    const sql = `SELECT * FROM tickets ORDER BY id DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// API: إنشاء تذكرة جديدة (مع التحقق من وجود اسم الموظف والمصلحة)
app.post('/api/tickets', (req, res) => {
    const { title, priority, created_by } = req.body;

    // التحقق من الجانب الخفي لمنع إنشاء تذكرة بدون بيانات الموظف والمصلحة
    if (!created_by || !created_by.trim() || !title || !title.trim()) {
        return res.status(400).json({ error: 'اسم الموظف، المصلحة، وعنوان المشكلة حقول إجبارية!' });
    }

    const sql = `INSERT INTO tickets (title, priority, created_by, status, created_at) VALUES (?, ?, ?, 'جديدة', DATETIME('now', 'localtime'))`;
    
    db.run(sql, [title.trim(), priority || 'P3', created_by.trim()], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({
            id: this.lastID,
            message: 'تم إنشاء التذكرة بنجاح'
        });
    });
});

// توجيه الصفحة الرئيسية إلى index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
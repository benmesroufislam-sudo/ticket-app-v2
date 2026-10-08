const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'islamISLAM1995';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات السحابية PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// إنشاء الجدول في السحابة
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                employee_name TEXT,
                email TEXT,
                department TEXT,
                description TEXT,
                priority TEXT,
                status TEXT DEFAULT 'قيد الانتظار',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('تم إعداد قاعدة البيانات السحابية بنجاح.');
    } catch (err) {
        console.error('خطأ في تهيئة قاعدة البيانات:', err.message);
    }
};
initDb();

// 1. مسار إرسال التذكرة
app.post('/api/tickets', async (req, res) => {
    const { employee_name, email, department, description, priority } = req.body;
    if (!email || !email.trim()) {
        return res.status(400).json({ error: "البريد الإلكتروني إجباري" });
    }
    
    try {
        const sql = `INSERT INTO tickets (employee_name, email, department, description, priority, status) 
                     VALUES ($1, $2, $3, $4, $5, 'قيد الانتظار') RETURNING id`;
        const result = await pool.query(sql, [employee_name, email, department, description, priority || 'عادية']);
        res.json({ id: result.rows[0].id, success: true });
    } catch (err) {
        console.error('خطأ أثناء إضافة التذكرة:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 2. مسار جلب التذاكر
app.post('/api/admin/tickets', async (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        try {
            const result = await pool.query("SELECT * FROM tickets ORDER BY id DESC");
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    } else {
        res.status(401).json({ error: "كلمة المرور غير صحيحة" });
    }
});

// 3. مسار تحديث حالة التذكرة
app.post('/api/admin/tickets/status', async (req, res) => {
    const { password, id, status } = req.body;
    if (password === ADMIN_PASSWORD) {
        try {
            await pool.query(`UPDATE tickets SET status = $1 WHERE id = $2`, [status, id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    } else {
        res.status(401).json({ error: "غير مصرح" });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
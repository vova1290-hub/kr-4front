const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ (Supabase)
const pool = new Pool({
    host: 'aws-0-eu-west-1.pooler.supabase.com',  
    port: 6543,
    database: 'postgres',
    user: 'postgres.fezisypagbfktiiorkac',
    password: 'Vladimir_12909012',  
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(bodyParser.json());

// Проверка подключения
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ Подключено к PostgreSQL (Supabase)');
    }
    if (client) release();
});

// Создание таблицы users
const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        age INTEGER NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
`;

pool.query(createTableQuery, (err) => {
    if (err) {
        console.error('❌ Ошибка создания таблицы:', err.message);
    } else {
        console.log('✅ Таблица users готова');
    }
});

// ========== API ==========

// 1. POST /api/users - создать пользователя
app.post('/api/users', async (req, res) => {
    try {
        const { first_name, last_name, age } = req.body;
        
        if (!first_name || !last_name || !age) {
            return res.status(400).json({ error: 'Все поля обязательны: first_name, last_name, age' });
        }
        
        const now = Date.now();
        const query = `
            INSERT INTO users (first_name, last_name, age, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [first_name, last_name, age, now, now];
        
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка создания:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 2. GET /api/users - получить всех пользователей
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения списка:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 3. GET /api/users/:id - получить одного пользователя
app.get('/api/users/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка получения пользователя:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 4. PATCH /api/users/:id - обновить пользователя
app.patch('/api/users/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { first_name, last_name, age } = req.body;
        
        // Проверяем, существует ли пользователь
        const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Собираем поля для обновления
        const updates = [];
        const values = [];
        let idx = 1;
        
        if (first_name !== undefined) {
            updates.push(`first_name = $${idx++}`);
            values.push(first_name);
        }
        if (last_name !== undefined) {
            updates.push(`last_name = $${idx++}`);
            values.push(last_name);
        }
        if (age !== undefined) {
            updates.push(`age = $${idx++}`);
            values.push(age);
        }
        
        updates.push(`updated_at = $${idx++}`);
        values.push(Date.now());
        values.push(id);
        
        const query = `
            UPDATE users 
            SET ${updates.join(', ')} 
            WHERE id = $${idx}
            RETURNING *
        `;
        
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка обновления:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 5. DELETE /api/users/:id - удалить пользователя
app.delete('/api/users/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        const checkResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ message: 'Пользователь удалён' });
    } catch (err) {
        console.error('Ошибка удаления:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${port}`);
});
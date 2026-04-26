const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = 3000;

// Разрешаем JSON и CORS
app.use(cors());
app.use(express.json());

// ПОДКЛЮЧЕНИЕ К MONGODB
const mongoURI = 'mongodb://localhost:27017/mydatabase';

mongoose.connect(mongoURI)
    .then(() => console.log('✅ Подключено к MongoDB'))
    .catch(err => console.error('❌ Ошибка подключения к MongoDB:', err.message));

// СХЕМА (структура данных пользователя)
const userSchema = new mongoose.Schema({
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    age: { type: Number, required: true },
    created_at: { type: Number, default: Date.now },
    updated_at: { type: Number, default: Date.now }
});

// МОДЕЛЬ (объект для работы с коллекцией users)
const User = mongoose.model('User', userSchema);

// ========== API ==========

// 1. POST /api/users - создание пользователя
app.post('/api/users', async (req, res) => {
    try {
        const { first_name, last_name, age } = req.body;

        // Проверка обязательных полей
        if (!first_name || !last_name || !age) {
            return res.status(400).json({ error: 'Все поля обязательны: first_name, last_name, age' });
        }

        // Создаём нового пользователя
        const user = new User({
            first_name,
            last_name,
            age,
            created_at: Date.now(),
            updated_at: Date.now()
        });

        // Сохраняем в базу
        await user.save();

        // Возвращаем созданного пользователя
        res.status(201).json(user);
    } catch (err) {
        console.error('Ошибка создания:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 2. GET /api/users - получение всех пользователей
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().sort({ created_at: -1 });
        res.json(users);
    } catch (err) {
        console.error('Ошибка получения списка:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 3. GET /api/users/:id - получение одного пользователя по ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(user);
    } catch (err) {
        console.error('Ошибка получения пользователя:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 4. PATCH /api/users/:id - обновление пользователя
app.patch('/api/users/:id', async (req, res) => {
    try {
        const { first_name, last_name, age } = req.body;

        // Собираем только те поля, которые пришли
        const updates = {};
        if (first_name !== undefined) updates.first_name = first_name;
        if (last_name !== undefined) updates.last_name = last_name;
        if (age !== undefined) updates.age = age;
        updates.updated_at = Date.now();

        // Обновляем пользователя
        const user = await User.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(user);
    } catch (err) {
        console.error('Ошибка обновления:', err.message);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 5. DELETE /api/users/:id - удаление пользователя
app.delete('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

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
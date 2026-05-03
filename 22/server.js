const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        message: 'Ответ от сервера',
        port: PORT,
        time: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', port: PORT });
});

app.get('/api/products', (req, res) => {
    res.json({
        source: 'server',
        port: PORT,
        products: [
            { id: 1, name: 'Ноутбук', price: 1500 },
            { id: 2, name: 'Мышь', price: 25 }
        ]
    });
});

app.get('/api/users', (req, res) => {
    res.json({
        source: 'server',
        port: PORT,
        users: [
            { id: 1, username: 'admin', role: 'admin' },
            { id: 2, username: 'user1', role: 'user' }
        ]
    });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

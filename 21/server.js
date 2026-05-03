const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");

const app = express();
app.use(express.json());

const PORT = 3000;

// Секреты подписи
const ACCESS_SECRET = "access_secret";
const REFRESH_SECRET = "refresh_secret";

// Время жизни токенов
const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";

// Время хранения кэша
const USERS_CACHE_TTL = 60;      // 1 минута
const PRODUCTS_CACHE_TTL = 600;  // 10 минут

// ============ ПОДКЛЮЧЕНИЕ К REDIS ============
const redisClient = createClient({ url: 'redis://localhost:6379' });

redisClient.on('error', (err) => console.error('Redis ошибка:', err.message));
redisClient.on('connect', () => console.log('✅ Подключено к Redis'));

redisClient.connect();

// ============ ХРАНИЛИЩЕ ДАННЫХ ============
let users = [
    {
        id: "1",
        username: "admin",
        passwordHash: null, // будет установлен при запуске
        role: "admin",
        blocked: false
    }
];

let products = [
    { id: "1", name: "Ноутбук", price: 1500, stock: 10 },
    { id: "2", name: "Мышь", price: 25, stock: 100 },
    { id: "3", name: "Клавиатура", price: 75, stock: 50 }
];

const refreshTokens = new Set();

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

function generateAccessToken(user) {
    return jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        ACCESS_SECRET,
        { expiresIn: ACCESS_EXPIRES_IN }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        REFRESH_SECRET,
        { expiresIn: REFRESH_EXPIRES_IN }
    );
}

// ============ MIDDLEWARE ============
function authMiddleware(req, res, next) {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    
    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }
    
    try {
        const payload = jwt.verify(token, ACCESS_SECRET);
        const user = users.find((u) => u.id === payload.sub);
        
        if (!user || user.blocked) {
            return res.status(401).json({ error: "User not found or blocked" });
        }
        
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

function roleMiddleware(allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: "Forbidden" });
        }
        next();
    };
}

// ============ КЭШИРОВАНИЕ ============
function cacheMiddleware(keyBuilder, ttl) {
    return async (req, res, next) => {
        try {
            const key = keyBuilder(req);
            const cachedData = await redisClient.get(key);
            
            if (cachedData) {
                console.log(`✅ КЭШ: данные из кэша "${key}"`);
                return res.json({
                    source: "cache",
                    data: JSON.parse(cachedData)
                });
            }
            
            console.log(`❌ КЭШ: промах "${key}"`);
            req.cacheKey = key;
            req.cacheTTL = ttl;
            next();
        } catch (err) {
            console.error("Cache read error:", err);
            next();
        }
    };
}

async function saveToCache(key, data, ttl) {
    try {
        await redisClient.setEx(key, ttl, JSON.stringify(data));
        console.log(`💾 КЭШ: сохранён "${key}" на ${ttl} сек`);
    } catch (err) {
        console.error("Cache save error:", err);
    }
}

async function invalidateUsersCache(userId = null) {
    try {
        await redisClient.del("users:all");
        if (userId) {
            await redisClient.del(`users:${userId}`);
        }
        console.log(`🗑️ КЭШ ПОЛЬЗОВАТЕЛЕЙ ОЧИЩЕН`);
    } catch (err) {
        console.error("Users cache invalidate error:", err);
    }
}

async function invalidateProductsCache(productId = null) {
    try {
        await redisClient.del("products:all");
        if (productId) {
            await redisClient.del(`products:${productId}`);
        }
        console.log(`🗑️ КЭШ ТОВАРОВ ОЧИЩЕН`);
    } catch (err) {
        console.error("Products cache invalidate error:", err);
    }
}

// ==================== AUTH ====================

app.post("/api/auth/register", async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "username and password are required" });
    }

    const exists = users.some(u => u.username === username);
    if (exists) {
        return res.status(409).json({ error: "username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = {
        id: String(users.length + 1),
        username,
        passwordHash,
        role: role || "user",
        blocked: false
    };

    users.push(user);
    await invalidateUsersCache();

    res.status(201).json({
        id: user.id,
        username: user.username,
        role: user.role,
        blocked: user.blocked
    });
});

app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "username and password are required" });
    }

    const user = users.find(u => u.username === username);
    if (!user || user.blocked) {
        return res.status(401).json({ error: "Invalid credentials or user is blocked" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    refreshTokens.add(refreshToken);

    res.json({ accessToken, refreshToken });
});

app.post("/api/auth/refresh", (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({ error: "refreshToken is required" });
    }

    if (!refreshTokens.has(refreshToken)) {
        return res.status(401).json({ error: "Invalid refresh token" });
    }

    try {
        const payload = jwt.verify(refreshToken, REFRESH_SECRET);
        const user = users.find(u => u.id === payload.sub);

        if (!user || user.blocked) {
            return res.status(401).json({ error: "User not found or blocked" });
        }

        refreshTokens.delete(refreshToken);
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        refreshTokens.add(newRefreshToken);

        res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
    }
});

app.get("/api/auth/me", authMiddleware, roleMiddleware(["user", "seller", "admin"]), (req, res) => {
    const user = users.find(u => u.id === req.user.sub);
    res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        blocked: user.blocked
    });
});

app.post("/api/auth/logout", (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        refreshTokens.delete(refreshToken);
    }
    res.json({ message: "Logged out successfully" });
});

// ==================== USERS (кэш 1 минута) ====================

app.get(
    "/api/users",
    authMiddleware,
    roleMiddleware(["admin"]),
    cacheMiddleware(() => "users:all", USERS_CACHE_TTL),
    async (req, res) => {
        console.log("📡 База данных: запрос списка пользователей");
        const data = users.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            blocked: u.blocked
        }));
        
        await saveToCache(req.cacheKey, data, req.cacheTTL);
        res.json({
            source: "database",
            data
        });
    }
);

app.get(
    "/api/users/:id",
    authMiddleware,
    roleMiddleware(["admin"]),
    cacheMiddleware((req) => `users:${req.params.id}`, USERS_CACHE_TTL),
    async (req, res) => {
        console.log(`📡 База данных: запрос пользователя ${req.params.id}`);
        const user = users.find(u => u.id === req.params.id);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const data = {
            id: user.id,
            username: user.username,
            role: user.role,
            blocked: user.blocked
        };

        await saveToCache(req.cacheKey, data, req.cacheTTL);
        res.json({
            source: "database",
            data
        });
    }
);

app.put("/api/users/:id", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
    const { username, role, blocked } = req.body;
    const user = users.find(u => u.id === req.params.id);
    
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    
    if (username !== undefined) user.username = username;
    if (role !== undefined) user.role = role;
    if (blocked !== undefined) user.blocked = blocked;
    
    await invalidateUsersCache(user.id);
    
    res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        blocked: user.blocked
    });
});

app.delete("/api/users/:id", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    
    user.blocked = true;
    await invalidateUsersCache(user.id);
    
    res.json({
        message: "User blocked",
        id: user.id
    });
});

// ==================== PRODUCTS (кэш 10 минут) ====================

app.get(
    "/api/products",
    authMiddleware,
    roleMiddleware(["user", "seller", "admin"]),
    cacheMiddleware(() => "products:all", PRODUCTS_CACHE_TTL),
    async (req, res) => {
        console.log("📡 База данных: запрос списка товаров");
        await saveToCache(req.cacheKey, products, req.cacheTTL);
        res.json({
            source: "database",
            data: products
        });
    }
);

app.get(
    "/api/products/:id",
    authMiddleware,
    roleMiddleware(["user", "seller", "admin"]),
    cacheMiddleware((req) => `products:${req.params.id}`, PRODUCTS_CACHE_TTL),
    async (req, res) => {
        console.log(`📡 База данных: запрос товара ${req.params.id}`);
        const product = products.find(p => p.id === req.params.id);
        
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        
        await saveToCache(req.cacheKey, product, req.cacheTTL);
        res.json({
            source: "database",
            data: product
        });
    }
);

app.post("/api/products", authMiddleware, roleMiddleware(["seller", "admin"]), async (req, res) => {
    const { name, price, stock } = req.body;
    
    if (!name || price === undefined) {
        return res.status(400).json({ error: "name and price are required" });
    }
    
    const newProduct = {
        id: String(products.length + 1),
        name,
        price,
        stock: stock || 0
    };
    
    products.push(newProduct);
    await invalidateProductsCache();
    
    res.status(201).json(newProduct);
});

app.put("/api/products/:id", authMiddleware, roleMiddleware(["seller", "admin"]), async (req, res) => {
    const { name, price, stock } = req.body;
    const product = products.find(p => p.id === req.params.id);
    
    if (!product) {
        return res.status(404).json({ error: "Product not found" });
    }
    
    if (name !== undefined) product.name = name;
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;
    
    await invalidateProductsCache(product.id);
    
    res.json(product);
});

app.delete("/api/products/:id", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
    const index = products.findIndex(p => p.id === req.params.id);
    
    if (index === -1) {
        return res.status(404).json({ error: "Product not found" });
    }
    
    products.splice(index, 1);
    await invalidateProductsCache(req.params.id);
    
    res.json({ message: "Product deleted", id: req.params.id });
});

// ==================== ЗАПУСК ====================
async function startServer() {
    // Создаем хеш для admin/admin123
    const adminUser = users.find(u => u.username === "admin");
    if (adminUser && !adminUser.passwordHash) {
        adminUser.passwordHash = await bcrypt.hash("admin123", 10);
    }
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Сервер на http://localhost:${PORT}`);
        console.log('\n📋 Тестовые данные:');
        console.log('   Admin:   admin / admin123');
        console.log('\n👥 USERS (кэш 1 мин, только admin):');
        console.log('   GET    /api/users');
        console.log('   GET    /api/users/:id');
        console.log('\n📦 PRODUCTS (кэш 10 мин):');
        console.log('   GET    /api/products');
        console.log('   GET    /api/products/:id');
    });
}

startServer();
## Запуск

### Практика 21 (Redis кэширование)
```bash
cd 21
docker run -d --name redis-cache -p 6379:6379 redis
node server.js

Практика 22 (балансировка)
cd 22
# Запустить 3 сервера в разных терминалах
PORT=3000 node server.js
PORT=3001 node server.js
PORT=3002 node server.js

# Запустить Nginx
sudo nginx -c $(pwd)/nginx.conf

# Проверить
curl http://localhost:8080/
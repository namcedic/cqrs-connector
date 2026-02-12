# NestJS CQRS + CDC with Debezium (MySQL to Cassandra)

Dự án minh họa kiến trúc **CQRS** kết hợp **CDC (Change Data Capture)** để đồng bộ dữ liệu giữa Write DB (MySQL) và Read DB (Cassandra) thông qua Kafka và Debezium.

## 🏗 Kiến trúc hệ thống

1.  **Write Path**: Client -> `api-service` (REST) -> `CommandBus` -> **MySQL**.
2.  **CDC Path**: **MySQL Binlog** -> **Debezium Connect** -> **Kafka Topic** (`mysql.app.users`).
3.  **Sync Path**: **Kafka** -> `cdc-consumer` (Service) -> **Cassandra** (Upsert).
4.  **Read Path**: Client -> `api-service` (REST) -> `QueryBus` -> **Cassandra**.

---

## 🛠 Tech Stack

- **Framework**: NestJS (Monorepo with Workspaces)
- **Databases**: MySQL 8.0 (Write), Cassandra 4.1 (Read)
- **Messaging/CDC**: Kafka, Zookeeper, Debezium Connect
- **Libraries**: TypeORM, Cassandra Driver, KafkaJS, `@nestjs/cqrs`

---

## 🚀 Hướng dẫn Setup (Hybrid Mode)

### 1. Khởi động Cơ sở hạ tầng (Docker)

Đảm bảo bạn đã cài đặt Docker và Docker Compose.

```bash
# Tạo file .env từ template (Lưu ý: Bạn cần tạo file .env thật từ env.example)
cp env.example .env
```

Vì bạn chạy **Hybrid** (infra chạy Docker, app chạy local), MySQL sẽ được map ra host port **3307**.
- `MYSQL_HOST` nên là `localhost`
- `MYSQL_PORT` nên là `3307`

```bash
# Khởi động MySQL, Kafka, Cassandra, Debezium
docker-compose up -d
```

*Đợi khoảng 30-60s để các service (đặc biệt là Cassandra và Kafka) khởi động hoàn toàn.*

Cassandra schema sẽ được tự động apply bởi service `cassandra-init` trong `docker-compose.yml` (idempotent).

### 2. Cài đặt Dependencies & Chạy Apps (Local)

Mở 2 terminal riêng biệt:

**Terminal 1: API Service (Port 3000)**
```bash
npm install
npm run start:api
```

**Terminal 2: CDC Consumer**
```bash
npm run start:consumer
```

---

## 📡 Cấu hình Debezium Connector

Sau khi các container đã chạy, bạn cần đăng ký MySQL Connector với Debezium để bắt đầu track thay đổi:

```bash
curl -i -X POST -H "Content-Type: application/json" \
  --data @debezium/mysql-users-connector.json \
  http://localhost:8083/connectors
```

**Kiểm tra trạng thái connector:**
```bash
curl -s http://localhost:8083/connectors/mysql-source-connector/status
```

---

## 🧪 Verify luồng CDC Sync

### Bước 1: Tạo User (Write vào MySQL)
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

### Bước 2: Kiểm tra Sync
1.  **Log Consumer**: Xem terminal chạy `cdc-consumer`, bạn sẽ thấy log nhận event từ Kafka và upsert vào Cassandra.
2.  **Kiểm tra Cassandra**: Truy cập cqlsh để verify:
    ```bash
    docker exec -it cassandra cqlsh -e "SELECT * FROM user_read.users;"
    ```

### Bước 3: Đọc User (Read từ Cassandra)
```bash
# Lấy theo ID
curl http://localhost:3001/users/1

# Lấy danh sách (Pagination)
curl "http://localhost:3001/users?page=1&limit=10"
```

---

## 📝 API Endpoints

- `POST /users`: Tạo user mới (Write DB).
- `PUT /users/:id`: Cập nhật user (Write DB).
- `GET /users`: Lấy danh sách user (Read DB - Cassandra).
- `GET /users/:id`: Lấy chi tiết user (Read DB - Cassandra).

---

## 🔍 Troubleshooting

- **Binlog Error**: Đảm bảo MySQL chạy với `binlog_format=ROW`. (Đã cấu hình sẵn trong `docker-compose.yml`).
- **Cassandra Connection**: Nếu app báo lỗi connection, hãy đợi thêm 1 chút vì Cassandra cần thời gian để khởi động lâu hơn các DB khác.
- **Kafka Topic**: Debezium mặc định map theo format `server.database.table`. Trong config dự án này là `mysql.app.users`.

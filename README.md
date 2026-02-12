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

## 🔄 Luồng hoạt động chi tiết

### 1) Write (Command Side) -> MySQL

- Request tạo/sửa user đi vào `api-service`:
  - `POST /users`
  - `PUT /users/:id`
- Ở `api-service`, mọi write đều đi qua **CQRS**:
  - Controller gọi `CommandBus.execute(...)`
  - `CreateUserHandler` / `UpdateUserHandler` dùng **TypeORM** ghi vào MySQL table `app.users`
- Lưu ý: `api-service` **không publish event thủ công**.

### 2) Debezium Connect connect được MySQL như nào? (MySQL chấp nhận connect ra sao?)

#### 2.1 MySQL side (điều kiện cần để Debezium đọc được change)

- MySQL container được chạy kèm config để bật binlog và đảm bảo Debezium đọc được row changes:
  - `--log-bin=mysql-bin`
  - `--binlog_format=ROW`
  - `--binlog_row_image=FULL`
  - `--gtid-mode=ON`
  - `--enforce-gtid-consistency=ON`
- MySQL init tạo database `app`, table `users`.
- User `app/app` được cấp quyền trên schema `app` để `api-service` ghi dữ liệu.

#### 2.2 Debezium side (Debezium connect tới MySQL bằng gì?)

- Debezium Connect chạy trong Docker và connect tới MySQL bằng DNS nội bộ docker:
  - host: `mysql`
  - port: `3306`
- Connector config (`debezium/mysql-users-connector.json`) khai báo rõ:
  - `database.hostname=mysql`
  - `database.port=3306`
  - `database.user=root`
  - `database.password=root`

=> Tóm lại: MySQL **chấp nhận connect** vì:
- Debezium nằm cùng network docker với MySQL.
- Connector dùng đúng credential và MySQL đã bật binlog.

### 3) Debezium đẩy data qua Kafka như nào?

- Khi connector chạy:
  - Debezium snapshot schema/data lần đầu (nếu `snapshot.mode=initial`).
  - Sau đó chuyển sang streaming, đọc MySQL binlog.
- Connector filter chỉ lấy bảng `app.users`:
  - `database.include.list=app`
  - `table.include.list=app.users`
- Debezium publish event lên Kafka topic theo format:
  - `<topic.prefix>.<db>.<table>`
  - Với config hiện tại: `topic.prefix=mysql` => topic là **`mysql.app.users`**

Ví dụ message (schema-less vì `value.converter.schemas.enable=false`):

```json
{
  "before": null,
  "after": {
    "id": 7,
    "name": "A",
    "email": "a+...@ex.com",
    "created_at": "2026-02-12T03:34:38Z",
    "updated_at": "2026-02-12T03:34:38Z"
  },
  "op": "c",
  "source": { "...": "..." },
  "ts_ms": 1770867278874
}
```

Kiểm tra nhanh topic có data:

```bash
docker exec -i kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic mysql.app.users \
  --from-beginning \
  --max-messages 5 | cat
```

### 4) Consumer đọc data từ Kafka như nào? (Kafka -> Cassandra)

- `cdc-consumer` chạy local (Hybrid), nên connect vào Kafka thông qua host port:
  - `KAFKA_BROKER=localhost:9092`
  - `KAFKA_USERS_TOPIC=mysql.app.users`
- Consumer dùng KafkaJS:
  - `consumer.connect()`
  - `consumer.subscribe({ topic, fromBeginning: true })`
  - `consumer.run({ eachMessage: ... })`

Trong `eachMessage`:
- Parse JSON message từ Kafka.
- Normalize về `DebeziumEnvelope` để support cả 2 format:
  - message nằm root `{ before, after, op, ... }`
  - hoặc message bọc `payload` `{ payload: { before, after, op, ... } }`
- Demo hiện tại:
  - xử lý đủ 3 loại event:
    - `op = 'c'`: insert (create)
    - `op = 'u'`: update
    - `op = 'd'`: delete
- Với `op = 'c'` hoặc `op = 'u'`:
  - upsert Cassandra
- Với `op = 'd'`:
  - delete Cassandra theo partition key `user_id`

Cassandra side:

- Upsert Cassandra:
  - keyspace: `user_read`
  - table: `users`
  - partition key: `user_id`

Query upsert:

```sql
INSERT INTO user_read.users (user_id, name, email, created_at, updated_at)
VALUES (?, ?, ?, ?, ?);
```

### 5) Read (Query Side) -> Cassandra

- Request đọc user đi vào `api-service`:
  - `GET /users/:id`
  - `GET /users?page=1&limit=10`
- Ở `api-service`:
  - Controller gọi `QueryBus.execute(...)`
  - Query handler query thẳng Cassandra table `user_read.users`

---

## 🧪 Verify luồng CDC Sync

### Bước 1: Tạo User (Write vào MySQL)
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

### Bước 2: Kiểm tra Debezium connector
```bash
curl -s http://localhost:8083/connectors/mysql-source-connector/status | cat
```

### Bước 3: Kiểm tra Kafka topic có message
```bash
docker exec -i kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic mysql.app.users \
  --from-beginning \
  --max-messages 3 | cat
```

### Bước 4: Kiểm tra Consumer log
- Xem terminal chạy `cdc-consumer`.
- Bạn sẽ thấy các log kiểu:
  - `Received message from topic: mysql.app.users`
  - `Handling operation: c for user_id: ...`
  - `Successfully synced user_id: ... to Cassandra`

### Bước 5: Kiểm tra Cassandra có data
```bash
docker exec -i cassandra cqlsh -e "SELECT * FROM user_read.users;"
```

### Bước 6: Đọc User (Read từ Cassandra qua api-service)
```bash
# Lấy theo ID
curl http://localhost:3000/users/1

# Lấy danh sách (Pagination)
curl "http://localhost:3000/users?page=1&limit=10"
```

---

## 📝 API Endpoints

- `POST /users`: Tạo user mới (Write DB).
- `PUT /users/:id`: Cập nhật user (Write DB).
- `GET /users`: Lấy danh sách user (Read DB - Cassandra).
- `GET /users/:id`: Lấy chi tiết user (Read DB - Cassandra).

---

## 🔍 Troubleshooting

- **Connector RUNNING chưa?**
  ```bash
  curl -s http://localhost:8083/connectors/mysql-source-connector/status | cat
  ```

- **Topic đúng chưa?**
  - Debezium publish theo format `topic.prefix.db.table`.
  - Với dự án này là `mysql.app.users`.

- **Kafka có message không?**
  ```bash
  docker exec -i kafka kafka-console-consumer \
    --bootstrap-server localhost:9092 \
    --topic mysql.app.users \
    --from-beginning \
    --max-messages 1 | cat
  ```

- **Consumer group có chạy không?**
  ```bash
  docker exec -i kafka kafka-consumer-groups \
    --bootstrap-server localhost:9092 \
    --describe --group users-cdc-consumer | cat
  ```

- **Cassandra schema chưa có?**
  - `docker-compose.yml` có `cassandra-init` để auto apply schema.
  - Kiểm tra:
    ```bash
    docker exec -i cassandra cqlsh -e "DESCRIBE KEYSPACES;"
    ```

- **Hybrid env mapping**
  - App chạy local => dùng `localhost`:
    - `MYSQL_HOST=localhost` + `MYSQL_PORT=3307`
    - `KAFKA_BROKER=localhost:9092`
    - `CASSANDRA_HOST=localhost`
  - Debezium chạy trong docker => dùng DNS nội bộ:
    - `database.hostname=mysql`
    - `bootstrap.servers=kafka:29092`

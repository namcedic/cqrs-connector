# Mở rộng kiến trúc CQRS + CDC

File này ghi chú cách mở rộng hệ thống khi bạn muốn đi xa hơn demo ban đầu.

## 1. Thêm entity mới (ví dụ: orders)

### 1.1. Mức DB + Debezium

- Tạo table mới trong MySQL, ví dụ `orders`:
  ```sql
  CREATE TABLE orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  );
  ```
- Mở rộng Debezium connector:
  - Nếu muốn track thêm `orders` trong cùng connector:
    - `table.include.list = "app.users,app.orders"`
  - Topic Debezium sẽ là: `mysql.app.orders`.

### 1.2. Mức Cassandra

- Tạo table read cho `orders`, thiết kế partition key theo use case đọc:
  ```sql
  CREATE TABLE user_read.orders_by_user (
    user_id bigint,
    order_id bigint,
    total decimal,
    status text,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY (user_id, order_id)
  ) WITH CLUSTERING ORDER BY (order_id DESC);
  ```
- Có thể tạo nhiều projection khác nhau (ví dụ `orders_by_status`) nếu use case đọc yêu cầu.

### 1.3. Mức Consumer

- Cách đơn giản: tạo **consumer service mới** dùng lại pattern cũ:
  - Subscribe topic `mysql.app.orders`.
  - Parse Debezium event cho `orders` (định nghĩa `DebeziumOrder`).
  - Upsert vào `user_read.orders_by_user`.
- Cách chia module:
  - `src/orders-cdc/orders-cdc.module.ts`
  - `orders-cdc.service.ts` (tương tự `CdcConsumerService` hiện tại).
  - Tách logic parse Debezium thành helper chung để reuse.

---

## 2. Tái sử dụng logic parse Debezium

Hiện tại `DebeziumMessage`, `DebeziumEnvelope`, `getEnvelope` đã được tách ra `src/cdc/types/debezium-event.ts`.

Khi thêm entity mới, bạn chỉ cần:

- Định nghĩa type mới:
  ```ts
  export interface DebeziumOrder {
    id: string;
    user_id: string;
    total: string;
    status: string;
    created_at: string | null;
    updated_at: string | null;
  }
  ```
- Với mỗi message từ Kafka:
  ```ts
  const env = getEnvelope<DebeziumOrder>(parsed as DebeziumMessage<DebeziumOrder>);
  if (!env) return;
  ```

=> Không cần đụng lại phần parse root/payload nữa.

---

## 3. Retry, DLQ, và đảm bảo at-least-once

### 3.1. Hiện trạng demo

- Consumer sử dụng KafkaJS `eachMessage`, nếu upsert Cassandra lỗi thì chỉ log error.
- Không có retry/backoff hoặc dead-letter queue.

### 3.2. Hướng mở rộng

- Thêm retry đơn giản:
  ```ts
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await this.cassandraService.upsertUser(...);
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  ```
- Thêm DLQ topic:
  - Khi parse hoặc sync Cassandra bị lỗi không recover được:
    - Publish message gốc sang topic `dlq.mysql.app.users`.
  - Sau này có thể xây thêm tool xử lý lại DLQ.

---

## 4. Thay đổi schema (Schema Evolution)

### 4.1. Thêm cột mới vào MySQL

- Ví dụ thêm `phone` vào `users`:
  ```sql
  ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL;
  ```
- Debezium sẽ tự động đọc thêm field `phone` trong `after`.
- Bạn cập nhật:
  - Entity MySQL (write side) nếu muốn ghi field mới.
  - Model Cassandra + `upsertUser` để map field mới xuống read DB.

### 4.2. Tương thích ngược

- Khi thêm field mới:
  - Consumer nên xử lý `after.phone` có thể `undefined` / `null`.
- Khi xoá field:
  - Cần xoá/ignore field đó ở cả phía Cassandra, tránh lỗi mapping.

---

## 5. Tối ưu query side / pagination

### 5.1. Pagination Cassandra

Pagination hiện tại trong API demo là kiểu đơn giản (LIMIT + slice). Trong thực tế với Cassandra:

- Nên dùng **paging state** của driver:
  - Mỗi query trả về một `pageState`.
  - Client gửi lại `pageState` cho trang tiếp theo.

Pseudo-code:

```ts
const result = await client.execute(query, params, { prepare: true, fetchSize: 50 });
const nextPageState = result.pageState; // truyền lại cho client
```

### 5.2. Nhiều projection

- Tuỳ theo use case đọc, bạn có thể tạo nhiều bảng read khác nhau:
  - `users_by_email`
  - `orders_by_status`
  - v.v.
- Cùng một CDC event có thể được consumer đẩy vào nhiều projection song song.

---

## 6. Multi-service / Multi-connector

### 6.1. Tách consumer theo domain

- `users-cdc-consumer` chỉ xử lý `mysql.app.users`.
- `orders-cdc-consumer` xử lý `mysql.app.orders`.
- Mỗi consumer group id khác nhau, tránh đụng nhau.

### 6.2. Nhiều connector

- Có thể tách connector MySQL theo domain/schema khác nhau nếu cần config riêng:
  - `mysql-users-connector`
  - `mysql-orders-connector`

---

## 7. Ý tưởng mở rộng tiếp

- Thêm **GraphQL API** cho read side, query trực tiếp Cassandra.
- Thêm **Admin UI** hiển thị trạng thái CDC (connector status, lag, DLQ size).
- Dùng **Kafka Streams** hoặc **ksqlDB** để build read model trung gian trước khi xuống Cassandra.

File này chỉ là gợi ý, bạn có thể tự do mở rộng tuỳ theo use case thực tế.

# CQRS + Debezium CDC trên Kubernetes (kind)

Setup này chạy toàn bộ stack (MySQL, Kafka+Zookeeper, Debezium Connect, Cassandra, NestJS API, CDC consumer, Prometheus, Grafana) bên trong Kubernetes (kind). Không dùng Hybrid.

## 1. Chuẩn bị

### 1.1. Cài đặt bắt buộc

- Docker
- kubectl
- kind

Kiểm tra:
```bash
docker version
kubectl version --client
kind version
```

### 1.2. Tạo kind cluster

Ví dụ file `kind-config.yaml`:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080
        hostPort: 30080
        protocol: TCP
      - containerPort: 30081
        hostPort: 30081
        protocol: TCP
      - containerPort: 30083
        hostPort: 30083
        protocol: TCP
      - containerPort: 30300
        hostPort: 30300
        protocol: TCP
      - containerPort: 30900
        hostPort: 30900
        protocol: TCP
```

Tạo cluster:
```bash
kind create cluster --name cqrs-cdc --config kind-config.yaml
```

## 2. Build & load Docker images

Từ root project:

```bash
# Build images
docker build -t cqrs-cdc/api-service:local apps/api-service
docker build -t cqrs-cdc/cdc-consumer:local apps/cdc-consumer

# Load vào kind
kind load docker-image cqrs-cdc/api-service:local --name cqrs-cdc
kind load docker-image cqrs-cdc/cdc-consumer:local --name cqrs-cdc
```

## 3. Apply manifests K8s

### 3.1. Namespace + Config chung

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-config.yaml
```

### 3.2. MySQL

```bash
kubectl apply -f k8s/mysql/mysql-config.yaml
kubectl apply -f k8s/mysql/mysql-statefulset.yaml
```

Đợi MySQL chạy:
```bash
kubectl -n cqrs-cdc get pods -l app=mysql
```

### 3.3. Cassandra (3 nodes + init schema)

```bash
kubectl apply -f k8s/cassandra/cassandra-config.yaml
kubectl apply -f k8s/cassandra/cassandra-statefulset.yaml
```

Kiểm tra StatefulSet + Job init:
```bash
kubectl -n cqrs-cdc get pods -l app=cassandra
kubectl -n cqrs-cdc get jobs cassandra-init
```

### 3.4. Zookeeper + Kafka (3 brokers)

```bash
kubectl apply -f k8s/kafka/zookeeper.yaml
kubectl apply -f k8s/kafka/kafka-statefulset.yaml
```

Đợi Kafka lên:
```bash
kubectl -n cqrs-cdc get pods -l app=kafka
```

### 3.5. Debezium Connect + Connector Job

```bash
kubectl apply -f k8s/debezium/debezium-connect.yaml
kubectl apply -f k8s/debezium/debezium-connector-configmap.yaml
kubectl apply -f k8s/debezium/debezium-apply-connector-job.yaml
```

Kiểm tra Job apply connector:
```bash
kubectl -n cqrs-cdc get jobs debezium-apply-mysql-connector
kubectl -n cqrs-cdc logs job/debezium-apply-mysql-connector
```

Có thể port-forward Debezium Connect để xem status:
```bash
kubectl -n cqrs-cdc port-forward svc/debezium-connect 8083:8083
curl -s http://localhost:8083/connectors/mysql-source-connector/status | jq
```

### 3.6. Deploy api-service & cdc-consumer

```bash
kubectl apply -f k8s/apps/api-service.yaml
kubectl apply -f k8s/apps/cdc-consumer.yaml
```

Kiểm tra pods:
```bash
kubectl -n cqrs-cdc get pods -l app=api-service
kubectl -n cqrs-cdc get pods -l app=cdc-consumer
```

### 3.7. Prometheus + Grafana

```bash
kubectl apply -f k8s/monitoring/prometheus-config.yaml
kubectl apply -f k8s/monitoring/prometheus.yaml
kubectl apply -f k8s/monitoring/grafana.yaml
```

Truy cập:
- Prometheus: http://localhost:30900
- Grafana: http://localhost:30300 (admin/admin mặc định) — nên đổi password sau.

## 4. Verify CDC flow trên K8s

### 4.1. Gọi API tạo user

```bash
curl -X POST http://localhost:30080/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John K8s","email":"john+'$(date +%s)'@example.com"}'
```

### 4.2. Kiểm tra Debezium connector status

```bash
kubectl -n cqrs-cdc port-forward svc/debezium-connect 8083:8083
curl -s http://localhost:8083/connectors/mysql-source-connector/status | jq
```

### 4.3. Kiểm tra Kafka topic có message

Trong pod kafka (ví dụ kafka-0):

```bash
kubectl -n cqrs-cdc exec -it kafka-0 -- \
  kafka-console-consumer --bootstrap-server kafka:9092 \
    --topic mysql.app.users --from-beginning --max-messages 5
```

### 4.4. Kiểm tra log cdc-consumer

```bash
kubectl -n cqrs-cdc logs deployment/cdc-consumer
```

Bạn sẽ thấy log kiểu:
- `Received message from topic: mysql.app.users`
- `Handling operation: c for user_id: ...`
- `Successfully synced user_id: ... to Cassandra`

### 4.5. Kiểm tra Cassandra có data

```bash
kubectl -n cqrs-cdc exec -it cassandra-0 -- \
  cqlsh -e "SELECT * FROM user_read.users;"
```

### 4.6. Đọc user từ API (read từ Cassandra)

```bash
# Lấy theo ID
curl http://localhost:30080/users/1

# Lấy danh sách
curl "http://localhost:30080/users?page=1&limit=10"
```

## 5. Monitoring

### 5.1. Truy cập Prometheus

- URL: http://localhost:30900
- Có thể xem targets:
  - `Status -> Targets`

Hiện tại app chưa expose `/metrics`, nhưng bạn có thể mở rộng NestJS để thêm Prom metrics và Prometheus sẽ scrape được các target `api-service`, `cdc-consumer`, `debezium-connect`.

### 5.2. Truy cập Grafana

- URL: http://localhost:30300
- Login: `admin` / `admin` (theo Secret `grafana-admin`)

Thêm Prometheus datasource:
- URL datasource: `http://prometheus:9090`

Sau đó bạn có thể import dashboard hoặc tự tạo panel.

## 6. Gỡ toàn bộ stack

```bash
kind delete cluster --name cqrs-cdc
```

Hoặc xoá theo namespace:
```bash
kubectl delete namespace cqrs-cdc
```

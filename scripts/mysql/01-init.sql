-- Đảm bảo user app có quyền và dùng plugin native để tránh lỗi caching_sha2
ALTER USER 'app'@'%' IDENTIFIED WITH mysql_native_password BY 'app';
GRANT ALL PRIVILEGES ON app.* TO 'app'@'%';
FLUSH PRIVILEGES;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);

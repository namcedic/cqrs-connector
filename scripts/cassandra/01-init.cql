CREATE KEYSPACE IF NOT EXISTS user_read WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

CREATE TABLE IF NOT EXISTS user_read.users (
  user_id bigint,
  name text,
  email text,
  created_at timestamp,
  updated_at timestamp,
  PRIMARY KEY (user_id)
);

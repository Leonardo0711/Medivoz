SELECT 'CREATE DATABASE medivoz'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'medivoz'
)\gexec

\c medivoz
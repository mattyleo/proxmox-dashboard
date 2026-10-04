CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  created_at DATETIME DEFAULT NOW(),
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  address TEXT,
  api_key VARCHAR(36) UNIQUE NOT NULL DEFAULT (UUID()),
  status VARCHAR(50) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS servers (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  created_at DATETIME DEFAULT NOW(),
  company_id VARCHAR(36) NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  ip_address VARCHAR(50),
  os_version VARCHAR(255),
  total_ram BIGINT,
  used_ram BIGINT,
  total_cpu INT,
  cpu_usage FLOAT,
  total_disk BIGINT,
  used_disk BIGINT,
  pending_updates INT DEFAULT 0,
  last_seen DATETIME,
  status VARCHAR(50) DEFAULT 'unknown',
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vms (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  created_at DATETIME DEFAULT NOW(),
  server_id VARCHAR(36) NOT NULL,
  vmid INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  vm_type VARCHAR(20) DEFAULT 'qemu',
  status VARCHAR(50) NOT NULL,
  os_info VARCHAR(255),
  ip_address VARCHAR(255),
  uptime BIGINT DEFAULT 0,
  cpus INT,
  cpu_usage FLOAT,
  maxmem BIGINT,
  mem_used BIGINT,
  ram_usage FLOAT,
  maxdisk BIGINT,
  disk_used BIGINT,
  disk_usage FLOAT,
  agent_enabled TINYINT(1) DEFAULT 0,
  pending_updates INT DEFAULT 0,
  last_backup VARCHAR(100),
  health_issues TEXT,
  last_seen DATETIME,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metrics (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  created_at DATETIME DEFAULT NOW(),
  server_id VARCHAR(36),
  vm_id VARCHAR(36),
  type VARCHAR(50) NOT NULL,
  value FLOAT NOT NULL,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (vm_id) REFERENCES vms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  created_at DATETIME DEFAULT NOW(),
  company_id VARCHAR(36) NOT NULL,
  server_id VARCHAR(36),
  vm_id VARCHAR(36),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'open',
  ai_suggested_solution TEXT,
  resolved_at DATETIME,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (vm_id) REFERENCES vms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  created_at DATETIME DEFAULT NOW(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  solution TEXT NOT NULL,
  tags TEXT
);

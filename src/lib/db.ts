import mysql from 'mysql2/promise';

// Pool di connessioni MySQL — riutilizzato tra le richieste
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'proxmox_root_2024',
  database: process.env.DB_NAME || 'proxmox_dashboard',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export interface AppSettings {
  instance_name: string;
  hardware_host: string;
  environment_label: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  instance_name: 'GM-SYSTEM',
  hardware_host: 'Server HP ProLiant 380 (Locale)',
  environment_label: 'On-Premise Infrastructure',
};

let schemaInitialized = false;

export async function ensureSchema() {
  if (schemaInitialized) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INT PRIMARY KEY DEFAULT 1,
        instance_name VARCHAR(255) NOT NULL DEFAULT 'GM-SYSTEM',
        hardware_host VARCHAR(255) NOT NULL DEFAULT 'Server HP ProLiant 380 (Locale)',
        environment_label VARCHAR(255) NOT NULL DEFAULT 'On-Premise Infrastructure',
        updated_at DATETIME DEFAULT NOW()
      )
    `);

    await pool.execute(`
      INSERT IGNORE INTO app_settings (id, instance_name, hardware_host, environment_label)
      VALUES (1, 'GM-SYSTEM', 'Server HP ProLiant 380 (Locale)', 'On-Premise Infrastructure')
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        created_at DATETIME DEFAULT NOW(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'tecnico'
      )
    `);

    await pool.execute(`
      INSERT IGNORE INTO users (id, name, email, password, role) VALUES
      ('usr-admin-1', 'Mattia Leoni (Admin)', 'info@leonimattia.it', 'admin', 'admin'),
      ('usr-admin-2', 'Admin GM-SYSTEM', 'admin@gm-system.it', 'admin', 'admin'),
      ('usr-tech-1', 'Tecnico Supervisione', 'tecnico@gm-system.it', 'tecnico', 'tecnico'),
      ('usr-sup-1', 'Supervisore Sala Server', 'supervisore@gm-system.it', 'supervisore', 'supervisore')
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        created_at DATETIME DEFAULT NOW(),
        name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255),
        address TEXT,
        api_key VARCHAR(36) UNIQUE NOT NULL DEFAULT (UUID()),
        status VARCHAR(50) DEFAULT 'active'
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS servers (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        created_at DATETIME DEFAULT NOW(),
        company_id VARCHAR(36) NOT NULL,
        hostname VARCHAR(255) NOT NULL,
        ip_address VARCHAR(50),
        os_version VARCHAR(255),
        node_type VARCHAR(30) DEFAULT 'pve',
        pbs_info TEXT,
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
      )
    `);

    await pool.execute(`
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
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS metrics (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        created_at DATETIME DEFAULT NOW(),
        server_id VARCHAR(36),
        vm_id VARCHAR(36),
        type VARCHAR(50) NOT NULL,
        value FLOAT NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (vm_id) REFERENCES vms(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
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
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        created_at DATETIME DEFAULT NOW(),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        solution TEXT NOT NULL,
        tags TEXT
      )
    `);

    const alterStatements = [
      "ALTER TABLE servers ADD COLUMN IF NOT EXISTS os_version VARCHAR(255)",
      "ALTER TABLE servers ADD COLUMN IF NOT EXISTS node_type VARCHAR(30) DEFAULT 'pve'",
      "ALTER TABLE servers ADD COLUMN IF NOT EXISTS pbs_info TEXT",
      "ALTER TABLE servers ADD COLUMN IF NOT EXISTS used_ram BIGINT",
      "ALTER TABLE servers ADD COLUMN IF NOT EXISTS cpu_usage FLOAT",
      "ALTER TABLE servers ADD COLUMN IF NOT EXISTS used_disk BIGINT",
      "ALTER TABLE servers ADD COLUMN IF NOT EXISTS pending_updates INT DEFAULT 0",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS vm_type VARCHAR(20) DEFAULT 'qemu'",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS os_info VARCHAR(255)",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS ip_address VARCHAR(255)",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS uptime BIGINT DEFAULT 0",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS mem_used BIGINT",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS disk_used BIGINT",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS disk_usage FLOAT",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS agent_enabled TINYINT(1) DEFAULT 0",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS pending_updates INT DEFAULT 0",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS last_backup VARCHAR(100)",
      "ALTER TABLE vms ADD COLUMN IF NOT EXISTS health_issues TEXT"
    ];

    for (const stmt of alterStatements) {
      try {
        await pool.execute(stmt);
      } catch {
        try {
          const colDef = stmt.replace(' IF NOT EXISTS', '');
          await pool.execute(colDef);
        } catch {
          // Colonna già presente
        }
      }
    }

    schemaInitialized = true;
  } catch (err) {
    console.warn('Avviso inizializzazione schema DB:', (err as Error).message);
  }
}

export default pool;

// Helper per query semplici
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  await ensureSchema();
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const row = await queryOne<AppSettings>('SELECT instance_name, hardware_host, environment_label FROM app_settings WHERE id = 1');
    return row || DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

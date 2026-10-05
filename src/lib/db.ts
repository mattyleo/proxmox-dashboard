import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
  public_url?: string;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'supervisore' | 'tecnico';
  created_at?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  instance_name: '',
  hardware_host: '',
  environment_label: 'Infrastruttura Proxmox VE',
  public_url: '',
};

interface LocalStateFile {
  settings: AppSettings;
  users: StoredUser[];
}

const LOCAL_STATE_PATH = path.join(process.cwd(), 'data', 'local-state.json');

function readLocalState(): LocalStateFile {
  try {
    if (fs.existsSync(LOCAL_STATE_PATH)) {
      const raw = fs.readFileSync(LOCAL_STATE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        settings: parsed.settings || { ...DEFAULT_SETTINGS },
        users: Array.isArray(parsed.users) ? parsed.users : [],
      };
    }
  } catch {
    // Fallback su stato vuoto
  }
  return {
    settings: { ...DEFAULT_SETTINGS },
    users: [],
  };
}

function writeLocalState(state: LocalStateFile) {
  try {
    const dir = path.dirname(LOCAL_STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Ignora errori su filesystem read-only
  }
}

let schemaInitialized = false;

export async function ensureSchema() {
  if (schemaInitialized) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INT PRIMARY KEY DEFAULT 1,
        instance_name VARCHAR(255) NOT NULL DEFAULT '',
        hardware_host VARCHAR(255) NOT NULL DEFAULT '',
        environment_label VARCHAR(255) NOT NULL DEFAULT 'Infrastruttura Proxmox VE',
        updated_at DATETIME DEFAULT NOW()
      )
    `);

    await pool.execute(`
      INSERT IGNORE INTO app_settings (id, instance_name, hardware_host, environment_label)
      VALUES (1, '', '', 'Infrastruttura Proxmox VE')
    `);

    // Tabella utenti inizialmente VUOTA: chi installa ML-ProxVision crea il proprio Admin al primo avvio
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
      "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS public_url VARCHAR(255) DEFAULT ''",
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
    const row = await queryOne<AppSettings>(
      'SELECT instance_name, hardware_host, environment_label, public_url FROM app_settings WHERE id = 1'
    );
    if (row) return row;
  } catch {
    // Fallback su stato locale
  }
  return readLocalState().settings;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const clean: AppSettings = {
    instance_name: (settings.instance_name || '').trim(),
    hardware_host: (settings.hardware_host || '').trim(),
    environment_label: (settings.environment_label || 'Infrastruttura Proxmox VE').trim(),
    public_url: (settings.public_url || '').trim().replace(/\/$/, ''),
  };

  const state = readLocalState();
  state.settings = clean;
  writeLocalState(state);

  try {
    await ensureSchema();
    await pool.execute(
      `INSERT INTO app_settings (id, instance_name, hardware_host, environment_label, public_url, updated_at)
       VALUES (1, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         instance_name = VALUES(instance_name),
         hardware_host = VALUES(hardware_host),
         environment_label = VALUES(environment_label),
         public_url = VALUES(public_url),
         updated_at = NOW()`,
      [clean.instance_name, clean.hardware_host, clean.environment_label, clean.public_url || '']
    );
  } catch {
    // Salvato nel fallback locale
  }
}

export async function getUsersList(): Promise<StoredUser[]> {
  try {
    const rows = await query<StoredUser>(
      'SELECT id, name, email, password, role, created_at FROM users ORDER BY created_at ASC'
    );
    return rows;
  } catch {
    return readLocalState().users;
  }
}

export async function hasAnyUser(): Promise<boolean> {
  const users = await getUsersList();
  return users.length > 0;
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = email.trim().toLowerCase();
  try {
    const dbUser = await queryOne<StoredUser>(
      'SELECT id, name, email, password, role FROM users WHERE LOWER(email) = ?',
      [normalized]
    );
    if (dbUser) return dbUser;
  } catch {
    // Fallback su stato locale
  }
  const local = readLocalState().users.find((u) => u.email.toLowerCase() === normalized);
  return local || null;
}

export async function upsertUser(user: {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'supervisore' | 'tecnico';
}): Promise<StoredUser> {
  const cleanEmail = user.email.trim().toLowerCase();
  const cleanName = user.name.trim();
  const cleanPassword = user.password.trim();
  const role = user.role || 'tecnico';

  const state = readLocalState();
  const existingIdx = state.users.findIndex((u) => u.email.toLowerCase() === cleanEmail);
  const userId = existingIdx >= 0 ? state.users[existingIdx].id : crypto.randomUUID();
  const savedUser: StoredUser = {
    id: userId,
    name: cleanName,
    email: cleanEmail,
    password: cleanPassword,
    role,
    created_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    state.users[existingIdx] = savedUser;
  } else {
    state.users.push(savedUser);
  }
  writeLocalState(state);

  try {
    await ensureSchema();
    await pool.execute(
      `INSERT INTO users (id, name, email, password, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role)`,
      [userId, cleanName, cleanEmail, cleanPassword, role]
    );
  } catch {
    // Salvato nel fallback locale
  }

  return savedUser;
}

export async function removeUserById(id: string): Promise<void> {
  const state = readLocalState();
  state.users = state.users.filter((u) => u.id !== id);
  writeLocalState(state);

  try {
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
  } catch {
    // Rimosso dal fallback locale
  }
}

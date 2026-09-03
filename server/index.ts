import express, { type Request, type Response } from 'express';
import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppData, Block, Lessee, Location, Payment, Unit } from '../src/app/data/types';

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildPath = path.resolve(__dirname, '..', 'build');

const getPreferredDisplayHost = () => {
  const explicitHost = process.env.VITE_API_HOST || process.env.PUBLIC_HOST || process.env.HOST;
  if (explicitHost && explicitHost !== '0.0.0.0' && explicitHost !== '::') {
    return explicitHost;
  }

  const localAddress = Object.values(os.networkInterfaces())
    .flatMap(entries => entries ?? [])
    .find(entry => entry.family === 'IPv4' && !entry.internal);

  return localAddress?.address || '127.0.0.1';
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

const getServerInfo = () => {
  const displayHost = getPreferredDisplayHost();
  return {
    host: displayHost,
    port,
    bindHost: host,
    url: `http://${displayHost}:${port}`,
  };
};

const makeExternalId = (id: string | undefined, prefix: string) => {
  const cleaned = id?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : `${prefix}-${randomUUID()}`;
};

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE || 'commercial_unit_db',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  decimalNumbers: true,
};

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));
app.use(express.static(buildPath));

const bootstrapConnection = await mysql.createConnection({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
});

await bootstrapConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
await bootstrapConnection.end();

const pool = mysql.createPool(dbConfig);

const run = async (sql: string, params: Array<string | number | null> = [], connection?: mysql.PoolConnection) => {
  if (connection) {
    if (params.length === 0) {
      await connection.query(sql);
    } else {
      await connection.execute(sql, params);
    }
    return;
  }

  if (params.length === 0) {
    await pool.query(sql);
  } else {
    await pool.execute(sql, params);
  }
};

const all = async <T>(sql: string, params: Array<string | number | null> = [], connection?: mysql.PoolConnection) => {
  const [rows] = connection
    ? params.length === 0
      ? await connection.query(sql)
      : await connection.execute(sql, params)
    : params.length === 0
      ? await pool.query(sql)
      : await pool.execute(sql, params);
  return rows as T[];
};

const withTransaction = async <T>(callback: (connection: mysql.PoolConnection) => Promise<T>): Promise<T> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const saveDataInPlace = async (data: AppData): Promise<void> => {
  await withTransaction(async connection => {
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    await connection.execute('DELETE FROM payments');
    await connection.execute('DELETE FROM lessees');
    await connection.execute('DELETE FROM units');
    await connection.execute('DELETE FROM blocks');
    await connection.execute('DELETE FROM locations');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

    const locationIdMap = new Map<string, number>();
    const blockIdMap = new Map<string, number>();
    const unitIdMap = new Map<string, number>();
    const lesseeIdMap = new Map<string, number>();

    for (const location of data.locations) {
      const externalId = makeExternalId(location.id, 'location');
      const imageValue = typeof location.imageUrl === 'string' ? location.imageUrl : '';
      const [result] = await connection.execute(
        'INSERT INTO locations (externalId, name, imageUrl) VALUES (?, ?, ?)',
        [externalId, location.name, imageValue]
      );
      const insertId = (result as any).insertId as number;
      locationIdMap.set(location.id, insertId);
    }

    for (const block of data.blocks) {
      const locationId = locationIdMap.get(block.locationId);
      if (locationId === undefined) {
        throw new Error(`Block ${block.id} references unknown location ${block.locationId}`);
      }
      const externalId = makeExternalId(block.id, 'block');
      const [result] = await connection.execute(
        'INSERT INTO blocks (externalId, locationId, name, `order`) VALUES (?, ?, ?, ?)',
        [externalId, locationId, block.name, block.order]
      );
      blockIdMap.set(block.id, (result as any).insertId as number);
    }

    for (const unit of data.units) {
      const blockId = blockIdMap.get(unit.blockId);
      if (blockId === undefined) {
        throw new Error(`Unit ${unit.id} references unknown block ${unit.blockId}`);
      }
      const externalId = makeExternalId(unit.id, 'unit');
      const [result] = await connection.execute(
        'INSERT INTO units (externalId, blockId, number, `order`) VALUES (?, ?, ?, ?)',
        [externalId, blockId, unit.number, unit.order]
      );
      unitIdMap.set(unit.id, (result as any).insertId as number);
    }

    for (const lessee of data.lessees) {
      const unitId = unitIdMap.get(lessee.unitId);
      const blockId = blockIdMap.get(lessee.blockId);
      const locationId = locationIdMap.get(lessee.locationId);
      if (unitId === undefined) {
        throw new Error(`Lessee ${lessee.id} references unknown unit ${lessee.unitId}`);
      }
      if (blockId === undefined) {
        throw new Error(`Lessee ${lessee.id} references unknown block ${lessee.blockId}`);
      }
      if (locationId === undefined) {
        throw new Error(`Lessee ${lessee.id} references unknown location ${lessee.locationId}`);
      }

      lessee.unitIds?.forEach(id => {
        if (!unitIdMap.has(id)) {
          throw new Error(`Lessee ${lessee.id} references unknown unitId ${id}`);
        }
      });

      const externalId = makeExternalId(lessee.id, 'lessee');
      const [result] = await connection.execute(
        'INSERT INTO lessees (externalId, name, soa, unitId, unitIds, blockId, locationId, monthlyRent, startDate, endDate, isActive, hasDepositAdvance, depositAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          externalId,
          lessee.name,
          lessee.soa ?? null,
          unitId,
          lessee.unitIds ? JSON.stringify(lessee.unitIds) : null,
          blockId,
          locationId,
          lessee.monthlyRent,
          lessee.startDate,
          lessee.endDate ?? null,
          lessee.isActive ? 1 : 0,
          lessee.hasDepositAdvance ? 1 : 0,
          lessee.depositAmount ?? null,
        ]
      );
      lesseeIdMap.set(lessee.id, (result as any).insertId as number);
    }

    for (const payment of data.payments) {
      const lesseeId = lesseeIdMap.get(payment.lesseeId);
      if (lesseeId === undefined) {
        throw new Error(`Payment ${payment.id} references unknown lessee ${payment.lesseeId}`);
      }
      const externalId = makeExternalId(payment.id, 'payment');
      await connection.execute(
        'INSERT INTO payments (externalId, lesseeId, soa, amount, totalDue, date, method, type, forMonth, isComplete, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          externalId,
          lesseeId,
          payment.soa ?? null,
          payment.amount,
          payment.totalDue,
          payment.date,
          payment.method,
          payment.type,
          payment.forMonth,
          payment.isComplete ? 1 : 0,
          payment.notes ?? null,
        ]
      );
    }

    await connection.execute(
      'INSERT INTO app_settings (settingKey, settingValue) VALUES (?, ?) ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue)',
      ['shared_background_image', data.sharedBackgroundImage ?? '']
    );
  });
};

const pruneStaleSampleRecords = async () => {
  const staleNames = ['vincent123', 'test123'];
  if (staleNames.length === 0) return;

  const namesList = staleNames.map(name => `'${name.replace(/'/g, "''")}'`).join(', ');

  await run(`
    DELETE p FROM payments p
    JOIN lessees l ON p.lesseeId = l.id
    WHERE l.name IN (${namesList})
  `);

  await run(`
    DELETE FROM lessees
    WHERE name IN (${namesList})
  `);
};

const initializeDatabase = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS locations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      externalId VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      imageUrl LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS blocks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,      externalId VARCHAR(255) NOT NULL UNIQUE,      locationId BIGINT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      \`order\` INT NOT NULL,
      FOREIGN KEY(locationId) REFERENCES locations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS units (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,      externalId VARCHAR(255) NOT NULL UNIQUE,      blockId BIGINT UNSIGNED NOT NULL,
      number VARCHAR(255) NOT NULL,
      \`order\` INT NOT NULL,
      FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS lessees (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      externalId VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      soa VARCHAR(255),
      unitId BIGINT UNSIGNED NOT NULL,
      unitIds TEXT,
      blockId BIGINT UNSIGNED NOT NULL,
      locationId BIGINT UNSIGNED NOT NULL,
      monthlyRent INT NOT NULL,
      startDate VARCHAR(255) NOT NULL,
      endDate VARCHAR(255),
      isActive TINYINT NOT NULL,
      hasDepositAdvance TINYINT NOT NULL,
      depositAmount INT,
      FOREIGN KEY(unitId) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY(blockId) REFERENCES blocks(id) ON DELETE CASCADE,
      FOREIGN KEY(locationId) REFERENCES locations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      externalId VARCHAR(255) NOT NULL UNIQUE,
      lesseeId BIGINT UNSIGNED NOT NULL,
      soa VARCHAR(255),
      amount INT NOT NULL,
      totalDue INT NOT NULL,
      date VARCHAR(255) NOT NULL,
      method VARCHAR(255) NOT NULL,
      type VARCHAR(255) NOT NULL,
      forMonth VARCHAR(255) NOT NULL,
      isComplete TINYINT NOT NULL,
      notes TEXT,
      FOREIGN KEY(lesseeId) REFERENCES lessees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      settingKey VARCHAR(255) NOT NULL UNIQUE,
      settingValue LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await run(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS externalId VARCHAR(255) NOT NULL DEFAULT '' AFTER id`);
  await run(`ALTER TABLE locations MODIFY COLUMN imageUrl LONGTEXT NOT NULL`);
  await run(`ALTER TABLE blocks ADD COLUMN IF NOT EXISTS externalId VARCHAR(255) NOT NULL DEFAULT '' AFTER id`);
  await run(`ALTER TABLE units ADD COLUMN IF NOT EXISTS externalId VARCHAR(255) NOT NULL DEFAULT '' AFTER id`);
  await run(`ALTER TABLE lessees ADD COLUMN IF NOT EXISTS externalId VARCHAR(255) NOT NULL DEFAULT '' AFTER id`);
  await run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS externalId VARCHAR(255) NOT NULL DEFAULT '' AFTER id`);

  await run("UPDATE locations SET externalId = CONCAT('location-', UUID()) WHERE externalId = '' OR externalId IS NULL");
  await run("UPDATE blocks SET externalId = CONCAT('block-', UUID()) WHERE externalId = '' OR externalId IS NULL");
  await run("UPDATE units SET externalId = CONCAT('unit-', UUID()) WHERE externalId = '' OR externalId IS NULL");
  await run("UPDATE lessees SET externalId = CONCAT('lessee-', UUID()) WHERE externalId = '' OR externalId IS NULL");
  await run("UPDATE payments SET externalId = CONCAT('payment-', UUID()) WHERE externalId = '' OR externalId IS NULL");

  await pruneStaleSampleRecords();
};

const saveAppData = async (data: AppData) => {
  // Validate location images are not overly large (protect DB/storage)
  const MAX_BYTES = 700 * 1024; // 700 KB
  for (const loc of data.locations) {
    const url = typeof loc.imageUrl === 'string' ? loc.imageUrl : '';
    if (!url) continue;
    if (url.startsWith('data:') && url.includes(';base64,')) {
      const b64 = url.split(';base64,')[1] ?? '';
      try {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > MAX_BYTES) {
          throw new Error(`Location image for '${loc.name || loc.id}' exceeds 700 KB limit.`);
        }
      } catch (err) {
        throw new Error(`Invalid or oversized image for location '${loc.name || loc.id}'.`);
      }
    }
  }

  await saveDataInPlace(data);
};

const normalizeLoadedId = (id: string, prefix: string) => {
  const cleaned = id?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : `${prefix}-${randomUUID()}`;
};

const loadAppData = async (): Promise<AppData> => {
  const [locations, blocks, units, lessees, payments, settings] = await Promise.all([
    all<Location>('SELECT externalId AS id, name, imageUrl FROM locations ORDER BY externalId'),
    all<Block>('SELECT b.externalId AS id, l.externalId AS locationId, b.name, b.`order` AS `order` FROM blocks b JOIN locations l ON b.locationId = l.id ORDER BY b.`order`, b.externalId'),
    all<Unit>('SELECT u.externalId AS id, b.externalId AS blockId, u.number, u.`order` AS `order` FROM units u JOIN blocks b ON u.blockId = b.id ORDER BY u.`order`, u.externalId'),
    all<{
      id: string;
      name: string;
      soa: string | null;
      unitId: string;
      unitIds: string | null;
      blockId: string;
      locationId: string;
      monthlyRent: number;
      startDate: string;
      endDate: string | null;
      isActive: number;
      hasDepositAdvance: number;
      depositAmount: number | null;
    }>('SELECT les.externalId AS id, les.name, les.soa, u.externalId AS unitId, les.unitIds, b.externalId AS blockId, l.externalId AS locationId, les.monthlyRent, les.startDate, les.endDate, les.isActive, les.hasDepositAdvance, les.depositAmount FROM lessees les JOIN units u ON les.unitId = u.id JOIN blocks b ON les.blockId = b.id JOIN locations l ON les.locationId = l.id ORDER BY les.name'),
    all<Payment>('SELECT pay.externalId AS id, les.externalId AS lesseeId, pay.soa, pay.amount, pay.totalDue, pay.date, pay.method, pay.type, pay.forMonth, pay.isComplete, pay.notes FROM payments pay JOIN lessees les ON pay.lesseeId = les.id ORDER BY pay.date, pay.externalId'),
    all<{ settingKey: string; settingValue: string }>('SELECT settingKey, settingValue FROM app_settings'),
  ]);

  const sharedBackgroundImage = settings.find(setting => setting.settingKey === 'shared_background_image')?.settingValue ?? '';

  return {
    locations: locations.map(location => ({
      ...location,
      id: normalizeLoadedId(location.id, 'location'),
      imageUrl: location.imageUrl ?? '',
    })),
    blocks: blocks.map(block => ({
      ...block,
      id: normalizeLoadedId(block.id, 'block'),
      locationId: normalizeLoadedId(block.locationId, 'location'),
      order: Number(block.order),
    })),
    units: units.map(unit => ({
      ...unit,
      id: normalizeLoadedId(unit.id, 'unit'),
      blockId: normalizeLoadedId(unit.blockId, 'block'),
      order: Number(unit.order),
    })),
    lessees: lessees.map(lessee => ({
      id: normalizeLoadedId(lessee.id, 'lessee'),
      name: lessee.name,
      soa: lessee.soa ?? undefined,
      unitId: normalizeLoadedId(lessee.unitId, 'unit'),
      unitIds: lessee.unitIds ? JSON.parse(lessee.unitIds) : undefined,
      blockId: normalizeLoadedId(lessee.blockId, 'block'),
      locationId: normalizeLoadedId(lessee.locationId, 'location'),
      monthlyRent: lessee.monthlyRent,
      startDate: lessee.startDate,
      endDate: lessee.endDate ?? undefined,
      isActive: Boolean(lessee.isActive),
      hasDepositAdvance: Boolean(lessee.hasDepositAdvance),
      depositAmount: lessee.depositAmount ?? undefined,
    })),
    payments: payments.map(payment => ({
      ...payment,
      id: normalizeLoadedId(payment.id, 'payment'),
      lesseeId: normalizeLoadedId(payment.lesseeId, 'lessee'),
      isComplete: Boolean(payment.isComplete),
      notes: payment.notes ?? undefined,
    })),
    sharedBackgroundImage,
  };
};

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ...getServerInfo() });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') {
    next();
    return;
  }

  res.sendFile(path.join(buildPath, 'index.html'));
});

app.get('/api/server-info', (_req: Request, res: Response) => {
  res.json(getServerInfo());
});

app.get('/api/seed', async (_req: Request, res: Response) => {
  try {
    await initializeDatabase();
    res.json({ message: 'Database initialized', database: dbConfig.database, host: dbConfig.host });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/data', async (_req: Request, res: Response) => {
  try {
    const data = await loadAppData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/data', async (req: Request, res: Response) => {
  try {
    const data = req.body as AppData;
    await saveAppData(data);
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(port, host, async () => {
  console.log(`Server listening on http://${host}:${port}`);
  try {
    await initializeDatabase();
    console.log(`MySQL database ready at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  } catch (error) {
    console.error('MySQL initialization failed:', error);
  }
});

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.API_PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

const JWT_SECRET = process.env.JWT_SECRET;
const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
const redis = new Redis(process.env.KV_URL);
const TICKET_ALLOW_REUSE = process.env.TICKET_ALLOW_REUSE === 'true';
const TICKET_DEDUP_SECONDS = Number(process.env.TICKET_DEDUP_SECONDS || 3);

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'commutesmart', ts: Date.now() });
});

// Stops
app.get('/api/stops', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id::text as id, name, lat, lng, sequence FROM stops ORDER BY sequence ASC'
    );
    res.json(result.rows.map(s => ({
      id: s.id,
      name: s.name,
      lat: Number(s.lat),
      lng: Number(s.lng),
      waitingCount: Math.floor(Math.random() * 15),
      estimatedArrival: '08:00'
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login by phone + password
app.post('/api/auth/login/phone', async (req, res) => {
  try {
    const { phone, password, rememberMe } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    // Find user by phone
    const userResult = await pool.query(
      'SELECT id, openid, role, password_hash, status FROM users WHERE phone = $1',
      [phone]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: '用户不存在' });
    }

    const user = userResult.rows[0];

    if (user.status !== 1) {
      return res.status(403).json({ error: '账号已被禁用' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: '密码错误' });
    }

    // Update last login time
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const expiresIn = rememberMe ? '30d' : '24h';
    const token = jwt.sign(
      { id: user.id, role: user.role, openid: user.openid, phone },
      JWT_SECRET,
      { expiresIn }
    );

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        role: user.role, 
        openid: user.openid,
        phone: user.phone
      } 
    });
  } catch (error) {
    console.error('Phone login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login by username (admin)
app.post('/api/auth/login/admin', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // Special admin login
    if (username === 'admin' && password === 'admin123') {
      // Find or create admin user
      const adminResult = await pool.query(
        'SELECT id, openid, role, status FROM users WHERE openid = $1 LIMIT 1',
        ['admin_system']
      );

      let adminUser;
      if (adminResult.rows.length > 0) {
        adminUser = adminResult.rows[0];
      } else {
        const newId = crypto.randomUUID();
        await pool.query(
          'INSERT INTO users (id, openid, role, status) VALUES ($1, $2, $3, 1)',
          [newId, 'admin_system', 'ADMIN']
        );
        adminUser = { id: newId, openid: 'admin_system', role: 'ADMIN', status: 1 };
      }

      const expiresIn = rememberMe ? '30d' : '24h';
      const token = jwt.sign(
        { id: adminUser.id, role: 'ADMIN', openid: adminUser.openid },
        JWT_SECRET,
        { expiresIn }
      );

      return res.json({ 
        token, 
        user: { 
          id: adminUser.id, 
          role: 'ADMIN', 
          openid: adminUser.openid 
        } 
      });
    }

    // For other admin users, verify against password_hash
    const userResult = await pool.query(
      'SELECT id, openid, role, password_hash, status FROM users WHERE role = $1 AND (openid = $2 OR phone = $2)',
      ['ADMIN', username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: '管理员账号不存在' });
    }

    const user = userResult.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: '管理员账号未设置密码，请联系系统管理员' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: '密码错误' });
    }

    if (user.status !== 1) {
      return res.status(403).json({ error: '账号已被禁用' });
    }

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const expiresIn = rememberMe ? '30d' : '24h';
    const token = jwt.sign(
      { id: user.id, role: user.role, openid: user.openid },
      JWT_SECRET,
      { expiresIn }
    );

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        role: user.role, 
        openid: user.openid
      } 
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Original openid login (for backward compatibility)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { openid, device_id, rememberMe } = req.body;
    if (!openid) return res.status(400).json({ error: 'OpenID required' });

    const role = openid.startsWith('admin_') ? 'ADMIN' : openid.startsWith('driver_') ? 'DRIVER' : 'PASSENGER';
    const id = crypto.randomUUID();

    const existing = await pool.query(
      'SELECT id, openid, role, device_id FROM users WHERE openid = $1 LIMIT 1',
      [openid]
    );

    let user = existing.rows[0];
    let userId, userRole, userDeviceId;

    if (!user) {
      userId = id;
      userRole = role;
      userDeviceId = device_id;
      await pool.query(
        'INSERT INTO users (id, openid, role, device_id, status) VALUES ($1, $2, $3, $4, 1)',
        [userId, openid, userRole, userDeviceId]
      );
    } else {
      userId = user.id;
      userRole = user.role;
      userDeviceId = user.device_id || device_id;
      if (device_id && device_id !== user.device_id) {
        await pool.query(
          'UPDATE users SET device_id = $1, updated_at = NOW() WHERE id = $2',
          [device_id, userId]
        );
      }
    }

    const expiresIn = rememberMe ? '30d' : '24h';
    const token = jwt.sign({ id: userId, role: userRole, openid }, JWT_SECRET, { expiresIn });

    res.json({ token, user: { id: userId, role: userRole, device_id: userDeviceId } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auth middleware
const requireAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get current user profile
app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT name, company, position, phone FROM passengers WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // If not in passengers table, return basic user info from users table/token
      return res.json({
        name: req.user.role === 'ADMIN' ? '管理员' : '乘客',
        company: '两岸金融中心',
        position: req.user.role,
        phone: req.user.phone || ''
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate ticket
app.post('/api/tickets/generate', requireAuth, async (req, res) => {
  try {
    const ticketId = crypto.randomUUID();
    await redis.setex(`ticket:${ticketId}`, 180, JSON.stringify({
      userId: req.user.id,
      generatedAt: Date.now(),
      status: 'VALID'
    }));

    res.json({ ticketId, expiresIn: 180 });
  } catch (error) {
    console.error('Generate ticket error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify ticket
app.post('/api/tickets/verify', async (req, res) => {
  try {
    const { ticketId, driverOpenid } = req.body;

    // Get driver info from driverOpenid (for driver without login)
    let driverUserId = null;
    if (driverOpenid) {
      const driverResult = await pool.query(
        'SELECT id FROM users WHERE openid = $1',
        [driverOpenid]
      );
      if (driverResult.rows.length > 0) {
        driverUserId = driverResult.rows[0].id;
      }
    }

    // If no driverOpenid, check Authorization header
    if (!driverUserId) {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        try {
          const token = auth.split(' ')[1];
          const payload = jwt.verify(token, JWT_SECRET);
          driverUserId = payload.id;
        } catch (e) {
          // Invalid token, continue without driver
        }
      }
    }

    // If still no driver, use default driver
    if (!driverUserId) {
      const defaultDriver = await pool.query(
        'SELECT id FROM users WHERE openid = $1 LIMIT 1',
        ['driver_lvqinggang_13959282886']
      );
      if (defaultDriver.rows.length > 0) {
        driverUserId = defaultDriver.rows[0].id;
      } else {
        // Create default driver if not exists
        const newDriverId = crypto.randomUUID();
        await pool.query(
          'INSERT INTO users (id, openid, role, status) VALUES ($1, $2, $3, 1)',
          [newDriverId, 'driver_lvqinggang_13959282886', 'DRIVER']
        );
        driverUserId = newDriverId;
      }
    }

    const ticketData = await redis.get(`ticket:${ticketId}`);

    if (!ticketData) return res.json({ valid: false, error: '票据无效或已过期' });

    const data = JSON.parse(ticketData);
    const dedupKey = `ticket-verify-dedup:${ticketId}`;
    const dedupSet = await redis.set(dedupKey, '1', 'EX', TICKET_DEDUP_SECONDS, 'NX');

    // Get passenger info if available
    const passengerInfo = await pool.query(
      'SELECT name, company, position FROM passengers WHERE user_id = $1',
      [data.userId]
    );
    
    const passenger = passengerInfo.rows[0];

    if (dedupSet === null) {
      return res.json({ 
        valid: true,
        duplicate: true,
        passengerId: data.userId,
        passengerName: passenger ? passenger.name : null,
        passengerCompany: passenger ? passenger.company : null,
        passengerPosition: passenger ? passenger.position : null
      });
    }

    if (!TICKET_ALLOW_REUSE && data.status === 'USED') {
      return res.json({ valid: false, error: '票据已核销' });
    }

    if (!TICKET_ALLOW_REUSE) {
      await redis.setex(`ticket:${ticketId}`, 180, JSON.stringify({ ...data, status: 'USED' }));
    }

    await pool.query(
      'INSERT INTO verification_logs (user_id, driver_id, shuttle_id, verified_at) VALUES ($1, $2, $3, NOW())',
      [data.userId, driverUserId, 'default']
    );

    res.json({ 
      valid: true, 
      passengerId: data.userId,
      passengerName: passenger ? passenger.name : null,
      passengerCompany: passenger ? passenger.company : null,
      passengerPosition: passenger ? passenger.position : null
    });
  } catch (error) {
    console.error('Verify ticket error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Driver location
app.post('/api/driver/location', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'DRIVER' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = req.body;
    await redis.setex(
      `shuttle:${data.shuttleId || 'default'}`,
      3600,
      JSON.stringify({
        coords: data.coords,
        speed: data.speed || 0,
        heading: data.heading || 0,
        currentStopIndex: data.currentStopIndex || 0,
        distToNext: data.distToNext || 0,
        lastUpdated: Date.now()
      })
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Driver location error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Shuttle status
app.get('/api/shuttle/status', async (req, res) => {
  try {
    const shuttleId = req.query.shuttleId || 'default';
    const data = await redis.get(`shuttle:${shuttleId}`);
    res.json(data ? JSON.parse(data) : null);
  } catch (error) {
    console.error('Shuttle status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin stats
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

    const today = await pool.query(
      "SELECT COUNT(*)::int AS count FROM verification_logs WHERE verified_at >= date_trunc('day', NOW())"
    );
    const passengers = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'PASSENGER'"
    );

    res.json({
      todayRides: today.rows[0]?.count ?? 0,
      activeShuttles: 1,
      totalPassengers: passengers.rows[0]?.count ?? 0,
      onTimeRate: 98
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI suggestions
app.get('/api/admin/ai-suggestions', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    res.json([
      { time: '08:00', suggestion: '建议增加一班，预计减少等待时间5分钟' },
      { time: '08:30', suggestion: '保持现有班次，客流量正常' }
    ]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all passengers
app.get('/api/admin/passengers', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    
    const result = await pool.query(`
      SELECT 
        p.passenger_id, p.user_id, p.name, p.company, p.position, p.phone, p.status,
        p.created_at, p.updated_at,
        u.openid
      FROM passengers p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);
    
    res.json({ passengers: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get passengers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new passenger
app.post('/api/admin/passengers', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    
    const { name, company, position, phone } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }
    
    // Create user account with openid based on phone
    const openid = `passenger_${phone}`;
    const userId = crypto.randomUUID();
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE openid = $1',
      [openid]
    );
    
    let finalUserId;
    if (existingUser.rows.length > 0) {
      finalUserId = existingUser.rows[0].id;
    } else {
      await pool.query(
        'INSERT INTO users (id, openid, role, status) VALUES ($1, $2, $3, 1)',
        [userId, openid, 'PASSENGER']
      );
      finalUserId = userId;
    }
    
    // Insert passenger details
    const result = await pool.query(
      `INSERT INTO passengers (user_id, name, company, position, phone, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING passenger_id, user_id, name, company, position, phone, status, created_at`,
      [finalUserId, name, company || null, position || null, phone]
    );
    
    res.json({ passenger: result.rows[0] });
  } catch (error) {
    console.error('Create passenger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Schedules
app.get('/api/schedules', async (req, res) => {
  try {
    const { type, date, active_only = 'true' } = req.query;
    
    let query = `
      SELECT 
        s.schedule_id, s.departure_time, s.schedule_type, s.is_active, s.effective_from, s.effective_until,
        r.route_id, r.name as route_name, r.description as route_description, r.operating_days,
        v.vehicle_id, v.plate_number, v.capacity, v.status as vehicle_status,
        d.driver_id, d.name as driver_name, d.phone as driver_phone
      FROM schedules s
      LEFT JOIN routes r ON s.route_id = r.route_id
      LEFT JOIN vehicles v ON s.vehicle_id = v.vehicle_id
      LEFT JOIN drivers d ON s.driver_id = d.driver_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    if (active_only === 'true') {
      query += ` AND s.is_active = true`;
    }

    if (type && type !== 'ALL') {
      query += ` AND s.schedule_type = $${paramIndex++}`;
      params.push(type.toUpperCase());
    }

    if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD' });
        }
        query += ` AND (s.effective_from IS NULL OR s.effective_from <= $${paramIndex}) AND (s.effective_until IS NULL OR s.effective_until >= $${paramIndex})`;
        params.push(date);
        paramIndex++;
    }

    query += ` ORDER BY s.departure_time`;

    const result = await pool.query(query, params);

    const schedules = result.rows.map(row => ({
      schedule_id: row.schedule_id,
      departure_time: row.departure_time,
      schedule_type: row.schedule_type,
      is_active: row.is_active,
      effective_from: row.effective_from,
      effective_until: row.effective_until,
      routes: row.route_id ? {
        route_id: row.route_id,
        name: row.route_name,
        description: row.route_description,
        operating_days: row.operating_days
      } : null,
      vehicles: row.vehicle_id ? {
        vehicle_id: row.vehicle_id,
        plate_number: row.plate_number,
        capacity: row.capacity,
        status: row.vehicle_status
      } : null,
      drivers: row.driver_id ? {
        driver_id: row.driver_id,
        name: row.driver_name,
        phone: row.driver_phone
      } : null
    }));

    res.json({ schedules, count: schedules.length });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: error.message });
  }
});

// Holidays
app.get('/api/holidays', async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = new Date().getFullYear();
    const targetYear = year ? parseInt(year) : currentYear;
    
    let query = `SELECT * FROM holidays WHERE holiday_date >= $1 AND holiday_date <= $2`;
    let startDate = `${targetYear}-01-01`;
    let endDate = `${targetYear}-12-31`;

    if (month) {
      const monthNum = parseInt(month);
      const monthStr = String(monthNum).padStart(2, '0');
      startDate = `${targetYear}-${monthStr}-01`;
      
      const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
      const nextYear = monthNum === 12 ? targetYear + 1 : targetYear;
      const nextMonthStr = String(nextMonth).padStart(2, '0');
      
      query = `SELECT * FROM holidays WHERE holiday_date >= $1 AND holiday_date < $2`;
      endDate = `${nextYear}-${nextMonthStr}-01`;
    }

    query += ` ORDER BY holiday_date`;

    const result = await pool.query(query, [startDate, endDate]);

    res.json({
      holidays: result.rows,
      count: result.rows.length,
      year: targetYear,
      month: month ? parseInt(month) : null
    });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize default accounts on startup
const initDefaultAccounts = async () => {
  try {
    const bcryptPassword = await bcrypt.hash('123456', 10);

    // Create default admin
    const adminResult = await pool.query(
      'SELECT id FROM users WHERE openid = $1',
      ['admin_system']
    );
    if (adminResult.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (id, openid, role, status, password_hash) VALUES ($1, $2, $3, 1, $4)',
        [crypto.randomUUID(), 'admin_system', 'ADMIN', bcryptPassword]
      );
      console.log('Default admin account created: admin / admin123');
    }

    // Create default driver
    const driverResult = await pool.query(
      'SELECT id FROM users WHERE openid = $1',
      ['driver_lvqinggang_13959282886']
    );
    if (driverResult.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (id, openid, role, status, password_hash) VALUES ($1, $2, $3, 1, $4)',
        [crypto.randomUUID(), 'driver_lvqinggang_13959282886', 'DRIVER', bcryptPassword]
      );
      console.log('Default driver account created: driver_lvqinggang_13959282886');
    }

    // Update passenger phone and password
    const passengerResult = await pool.query(
      'SELECT id FROM users WHERE openid = $1',
      ['passenger_18559279970']
    );
    if (passengerResult.rows.length > 0) {
      await pool.query(
        'UPDATE users SET phone = $1, password_hash = $2 WHERE id = $3',
        ['18559279970', bcryptPassword, passengerResult.rows[0].id]
      );
      console.log('Passenger phone account updated: 18559279970 / 123456');
    }

    // Add password_hash column if not exists
    try {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text UNIQUE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz');
    } catch (e) {
      // Columns may already exist
    }
  } catch (error) {
    console.error('Error initializing default accounts:', error);
  }
};

// SPA Fallback - Handle all other requests by serving index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Initialize default accounts then start server
initDefaultAccounts().then(() => {
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
});

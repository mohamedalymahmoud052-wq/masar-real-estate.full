require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing from .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const cloudinaryReady = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryReady) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const storage = cloudinaryReady
  ? new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'masar-properties',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif']
      }
    })
  : multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-session-secret-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

const clean = value => String(value ?? '').trim().slice(0, 5000);

const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const isAdmin = (req, res, next) =>
  req.session.admin
    ? next()
    : res.status(401).json({
        error: 'Please sign in to the admin dashboard.'
      });

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      title_ar TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      description_ar TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL,
      area_other TEXT NOT NULL DEFAULT '',
      market TEXT NOT NULL,
      category TEXT NOT NULL,
      property_type TEXT NOT NULL DEFAULT 'Apartment',
      price TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      bedrooms TEXT NOT NULL DEFAULT '',
      payment TEXT NOT NULL DEFAULT '',
      developer TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]',
      featured INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );

    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      area_other TEXT NOT NULL DEFAULT '',
      market TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      budget TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'interest form',
      status TEXT NOT NULL DEFAULT 'New',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    );

    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  const adminResult = await pool.query(
    'SELECT id FROM admins LIMIT 1'
  );

  if (adminResult.rowCount === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
      throw new Error(
        'Set ADMIN_PASSWORD in .env before starting the server.'
      );
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
      [username, hash]
    );

    console.log('Initial admin account created.');
  }

  console.log('Database initialized successfully.');
}

app.get('/api/config', (req, res) => {
  res.json({
    businessWhatsApp: process.env.BUSINESS_WHATSAPP || '',
    languageOptions: ['en', 'ar']
  });
});

// PUBLIC PROPERTY LIST
app.get('/api/properties', asyncRoute(async (req, res) => {
  const { area, market, category, search } = req.query;

  let sql = "SELECT * FROM properties WHERE status = 'active'";
  const values = [];

  function addFilter(condition, value) {
    values.push(value);
    sql += ` AND ${condition} $${values.length}`;
  }

  if (area) addFilter('area =', area);
  if (market) addFilter('market =', market);
  if (category) addFilter('category =', category);

  if (search) {
    values.push(`%${clean(search)}%`);
    const n = values.length;

    sql += ` AND (
      title ILIKE $${n} OR
      title_ar ILIKE $${n} OR
      description ILIKE $${n} OR
      description_ar ILIKE $${n} OR
      area ILIKE $${n}
    )`;
  }

  sql += ' ORDER BY featured DESC, id DESC';

  const result = await pool.query(sql, values);
  res.json(result.rows);
}));

app.get('/api/properties/:id', asyncRoute(async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM properties WHERE id = $1 AND status = 'active'",
    [Number(req.params.id)]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: 'Property not found.' });
  }

  res.json(result.rows[0]);
}));

// PROPERTY IMAGE UPLOAD
app.post(
  '/api/admin/uploads',
  isAdmin,
  (req, res, next) => {
    if (!cloudinaryReady) {
      return res.status(503).json({
        error: 'Cloudinary is not configured. Check your environment variables.'
      });
    }

    next();
  },
  upload.array('images', 12),
  (req, res) => {
    if (!req.files || !req.files.length) {
      return res.status(400).json({
        error: 'Choose at least one image.'
      });
    }

    res.json({
      images: req.files.map(file => file.path || file.url)
    });
  }
);

// WHATSAPP NOTIFICATION
async function notifyWhatsApp(lead) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = process.env.WHATSAPP_NOTIFY_TO;

  if (!token || !phoneId || !to) return;

  const message = [
    'New MASAR lead',
    `Name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Area: ${lead.area === 'Other' ? lead.area_other : lead.area}`,
    `Market: ${lead.market}`,
    `Category: ${lead.category}`,
    `Budget: ${lead.budget}`,
    `Details: ${lead.details}`,
    `Source: ${lead.source}`
  ].join('\n');

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message }
        })
      }
    );

    if (!response.ok) {
      console.error('WhatsApp API returned an error:', response.status);
    }
  } catch (error) {
    console.error('WhatsApp notification failed:', error.message);
  }
}

// CUSTOMER LEADS
app.post('/api/leads', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const name = clean(body.name);
  const phone = clean(body.phone);

  if (!name || !phone) {
    return res.status(400).json({
      error: 'Please enter your name and phone number.'
    });
  }

  if (name.length > 120 || phone.length > 40) {
    return res.status(400).json({
      error: 'Please check your details.'
    });
  }

  const lead = {
    name,
    phone,
    email: clean(body.email),
    area: clean(body.area),
    area_other: clean(body.area_other),
    market: clean(body.market),
    category: clean(body.category),
    budget: clean(body.budget),
    details: clean(body.details),
    property_id: body.property_id ? Number(body.property_id) : null,
    source: clean(body.source) || 'interest form'
  };

  const result = await pool.query(`
    INSERT INTO leads (
      name, phone, email, area, area_other, market,
      category, budget, details, property_id, source
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id
  `, [
    lead.name,
    lead.phone,
    lead.email,
    lead.area,
    lead.area_other,
    lead.market,
    lead.category,
    lead.budget,
    lead.details,
    lead.property_id,
    lead.source
  ]);

  await notifyWhatsApp(lead);

  res.status(201).json({
    ok: true,
    id: result.rows[0].id,
    message: 'Thanks! The MASAR team will contact you soon.'
  });
}));

// ADMIN LOGIN
app.post('/api/admin/login', asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};

  const result = await pool.query(
    'SELECT * FROM admins WHERE username = $1',
    [clean(username)]
  );

  const admin = result.rows[0];

  if (
    !admin ||
    !await bcrypt.compare(String(password || ''), admin.password_hash)
  ) {
    return res.status(401).json({
      error: 'Incorrect username or password.'
    });
  }

  req.session.admin = {
    id: admin.id,
    username: admin.username
  };

  res.json({ ok: true, username: admin.username });
}));

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({
    authenticated: !!req.session.admin,
    username: req.session.admin?.username || ''
  });
});

// ADMIN STATISTICS
app.get('/api/admin/stats', isAdmin, asyncRoute(async (req, res) => {
  const properties = await pool.query(
    "SELECT COUNT(*)::int AS n FROM properties WHERE status = 'active'"
  );

  const leads = await pool.query(
    'SELECT COUNT(*)::int AS n FROM leads'
  );

  const newLeads = await pool.query(
    "SELECT COUNT(*)::int AS n FROM leads WHERE status = 'New'"
  );

  const areas = await pool.query(`
    SELECT area, COUNT(*)::int AS count
    FROM leads
    GROUP BY area
    ORDER BY count DESC
    LIMIT 5
  `);

  res.json({
    properties: properties.rows[0].n,
    leads: leads.rows[0].n,
    newLeads: newLeads.rows[0].n,
    areas: areas.rows
  });
}));

app.get('/api/admin/properties', isAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM properties ORDER BY id DESC'
  );
  res.json(result.rows);
}));

// CREATE PROPERTY
app.post('/api/admin/properties', isAdmin, asyncRoute(async (req, res) => {
  const b = req.body || {};

  if (!clean(b.title) || !clean(b.area) ||
      !clean(b.market) || !clean(b.category)) {
    return res.status(400).json({
      error: 'Title, area, market and category are required.'
    });
  }

  const values = [
    clean(b.title),
    clean(b.title_ar),
    clean(b.description),
    clean(b.description_ar),
    clean(b.area),
    clean(b.area_other),
    clean(b.market),
    clean(b.category),
    clean(b.property_type) || 'Apartment',
    clean(b.price),
    clean(b.size),
    clean(b.bedrooms),
    clean(b.payment),
    clean(b.developer),
    clean(b.image_url),
    JSON.stringify(Array.isArray(b.images) ? b.images.map(clean).slice(0, 12) : []),
    b.featured ? 1 : 0,
    b.status === 'hidden' ? 'hidden' : 'active'
  ];

  const result = await pool.query(`
    INSERT INTO properties (
      title, title_ar, description, description_ar,
      area, area_other, market, category, property_type,
      price, size, bedrooms, payment, developer,
      image_url, images, featured, status
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,$16,$17,$18
    )
    RETURNING id
  `, values);

  res.status(201).json({
    ok: true,
    id: result.rows[0].id
  });
}));

// EDIT PROPERTY
app.put('/api/admin/properties/:id', isAdmin, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};

  const values = [
    clean(b.title),
    clean(b.title_ar),
    clean(b.description),
    clean(b.description_ar),
    clean(b.area),
    clean(b.area_other),
    clean(b.market),
    clean(b.category),
    clean(b.property_type) || 'Apartment',
    clean(b.price),
    clean(b.size),
    clean(b.bedrooms),
    clean(b.payment),
    clean(b.developer),
    clean(b.image_url),
    JSON.stringify(Array.isArray(b.images) ? b.images.map(clean).slice(0, 12) : []),
    b.featured ? 1 : 0,
    b.status === 'hidden' ? 'hidden' : 'active',
    id
  ];

  const result = await pool.query(`
    UPDATE properties SET
      title=$1, title_ar=$2, description=$3, description_ar=$4,
      area=$5, area_other=$6, market=$7, category=$8,
      property_type=$9, price=$10, size=$11, bedrooms=$12,
      payment=$13, developer=$14, image_url=$15, images=$16,
      featured=$17, status=$18
    WHERE id=$19
    RETURNING id
  `, values);

  if (!result.rowCount) {
    return res.status(404).json({ error: 'Property not found.' });
  }

  res.json({ ok: true });
}));

// DELETE PROPERTY
app.delete('/api/admin/properties/:id', isAdmin, asyncRoute(async (req, res) => {
  await pool.query(
    'DELETE FROM properties WHERE id = $1',
    [Number(req.params.id)]
  );
  res.json({ ok: true });
}));

// ADMIN LEADS
app.get('/api/admin/leads', isAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query(`
    SELECT leads.*, properties.title AS property_title
    FROM leads
    LEFT JOIN properties ON properties.id = leads.property_id
    ORDER BY leads.id DESC
  `);

  res.json(result.rows);
}));

app.patch('/api/admin/leads/:id', isAdmin, asyncRoute(async (req, res) => {
  const allowed = [
    'New', 'Contacted', 'Follow-up',
    'Qualified', 'Closed', 'Not interested'
  ];

  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  await pool.query(
    'UPDATE leads SET status = $1 WHERE id = $2',
    [req.body.status, Number(req.params.id)]
  );

  res.json({ ok: true });
}));

app.delete('/api/admin/leads/:id', isAdmin, asyncRoute(async (req, res) => {
  await pool.query(
    'DELETE FROM leads WHERE id = $1',
    [Number(req.params.id)]
  );

  res.json({ ok: true });
}));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);

  res.status(500).json({
    error: 'Something went wrong. Please try again.'
  });
});

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`MASAR Real Estate running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
}

startServer();
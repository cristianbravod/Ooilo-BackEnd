// server.js - Versión COMPLETA con todos los endpoints funcionando
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS
const corsOptions = {
  origin: [
    // IPs locales para desarrollo
    'http://localhost:3000',
    'http://localhost:19000', // Expo Metro Bundler
    'http://localhost:19001', // Expo DevTools
    'http://localhost:19006', // Expo Web
    'http://192.168.2.134:3000', // Tu IP local actual
    'http://192.168.2.134:19000',
    `exp://192.168.2.134:19000`,
    
    // 🔧 TUS IPs FIJAS EN LA NUBE - PUERTO 3000 (Backend)
    'http://44.226.145.213:3000',
    'http://54.187.200.255:3000',
    'http://34.213.214.55:3000',
    'http://35.164.95.156:3000',
    'http://44.230.95.183:3000',
    'http://44.229.200.200:3000',
    
    // 🔧 TUS IPs FIJAS - PUERTO 19000 (Expo en móvil)
    'http://44.226.145.213:19000',
    'http://54.187.200.255:19000',
    'http://34.213.214.55:19000',
    'http://35.164.95.156:19000',
    'http://44.230.95.183:19000',
    'http://44.229.200.200:19000',
    
    // 🔧 TUS IPs FIJAS - Expo Go Protocol
    'exp://44.226.145.213:19000',
    'exp://54.187.200.255:19000',
    'exp://34.213.214.55:19000',
    'exp://35.164.95.156:19000',
    'exp://44.230.95.183:19000',
    'exp://44.229.200.200:19000',
    
    // 🔧 TUS IPs FIJAS - HTTPS (si usas SSL)
    'https://44.226.145.213',
    'https://54.187.200.255',
    'https://34.213.214.55',
    'https://35.164.95.156',
    'https://44.230.95.183',
    'https://44.229.200.200',
    
    // 🔧 TUS IPs FIJAS - Sin puerto (para conexiones genéricas)
    'http://44.226.145.213',
    'http://54.187.200.255',
    'http://34.213.214.55',
    'http://35.164.95.156',
    'http://44.230.95.183',
    'http://44.229.200.200'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging mejorado
app.use((req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${clientIP}`);
  
  // Log de Origin para debugging CORS
  if (req.headers.origin) {
    console.log(`   Origin: ${req.headers.origin}`);
  }
  
  next();
});


// Configuración Supabase
const pool = new Pool({
  user: process.env.DB_USER || 'postgres.ugcrigkvfejqlsoqnxxh',
  host: process.env.DB_HOST || 'aws-0-us-east-2.pooler.supabase.com',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 6543,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Middleware de autenticación
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_123');
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// =====================================================
// HEALTH CHECK
// =====================================================
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    res.json({ 
      status: 'OK',
      provider: 'Supabase',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR',
      database: 'disconnected',
      error: error.message
    });
  }
});

// =====================================================
// AUTENTICACIÓN
// =====================================================
app.post('/api/auth/register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, email, password, telefono, direccion } = req.body;

    const existingUser = await client.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    const result = await client.query(
      `INSERT INTO usuarios (nombre, email, password, telefono, direccion, rol) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, nombre, email, telefono, direccion, rol`,
      [nombre, email, hashedPassword, telefono || null, direccion || null, 'cliente']
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback_secret_123', { expiresIn: '24h' });

    res.status(201).json({
      success: true,
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, telefono: user.telefono, direccion: user.direccion, rol: user.rol }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password } = req.body;
    
    const result = await client.query('SELECT * FROM usuarios WHERE email = $1 AND activo = true', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback_secret_123', { expiresIn: '24h' });

    res.json({
      success: true,
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, telefono: user.telefono, direccion: user.direccion, rol: user.rol }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ 
    success: true, 
    user: { id: req.user.id, nombre: req.user.nombre, email: req.user.email, telefono: req.user.telefono, direccion: req.user.direccion, rol: req.user.rol }
  });
});

// =====================================================
// CATEGORÍAS
// =====================================================
app.get('/api/categorias', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM categorias WHERE activo = true ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// MENÚ - TODOS LOS ENDPOINTS
// =====================================================

// Obtener menú completo
app.get('/api/menu', async (req, res) => {
  const client = await pool.connect();
  try {
    const { categoria_id, disponible } = req.query;
    
    let query = `
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE c.activo = true
    `;
    const params = [];
    let paramCount = 0;

    if (categoria_id) {
      paramCount++;
      query += ` AND m.categoria_id = $${paramCount}`;
      params.push(categoria_id);
    }

    if (disponible !== undefined) {
      paramCount++;
      query += ` AND m.disponible = $${paramCount}`;
      params.push(disponible === 'true');
    }

    query += ' ORDER BY c.nombre, m.nombre';

    const result = await client.query(query, params);
    console.log(`📋 Menú obtenido: ${result.rows.length} productos`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo menú:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// 🔧 ENDPOINT CRÍTICO: Sync de menú
app.get('/api/menu/sync', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🔄 Solicitud de sync menú recibida');
    
    const result = await client.query(`
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.disponible = true AND c.activo = true
      ORDER BY c.nombre, m.nombre
    `);
    
    console.log(`✅ Sync menú exitoso: ${result.rows.length} productos`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error en sync menú:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// 🔧 ENDPOINT CRÍTICO: Sincronización completa
app.get('/api/sync', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🔄 Sincronización completa solicitada');
    
    // Obtener menú
    const menuResult = await client.query(`
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE c.activo = true
      ORDER BY c.nombre, m.nombre
    `);
    
    // Obtener categorías
    const categoriasResult = await client.query(`
      SELECT * FROM categorias WHERE activo = true ORDER BY nombre
    `);
    
    // Obtener platos especiales
    const especialesResult = await client.query(`
      SELECT * FROM platos_especiales 
      WHERE disponible = true 
      AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY created_at DESC
    `);
    
    const response = {
      menu: menuResult.rows,
      categorias: categoriasResult.rows,
      especiales: especialesResult.rows,
      offline: false,
      timestamp: new Date().toISOString()
    };
    
    console.log(`✅ Sincronización completa exitosa: ${menuResult.rows.length} menú, ${categoriasResult.rows.length} categorías, ${especialesResult.rows.length} especiales`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error en sincronización completa:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en sincronización', 
      error: error.message,
      offline: true
    });
  } finally {
    client.release();
  }
});

// Crear producto
app.post('/api/menu', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, precio, categoria_id, descripcion, disponible, ingredientes, tiempo_preparacion, vegetariano, picante } = req.body;
    
    const result = await client.query(
      `INSERT INTO menu_items (nombre, precio, categoria_id, descripcion, disponible, ingredientes, tiempo_preparacion, vegetariano, picante) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nombre, precio, categoria_id, descripcion || null, disponible !== false, ingredientes || null, tiempo_preparacion || 0, vegetariano || false, picante || false]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Actualizar producto
app.put('/api/menu/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, precio, categoria_id, descripcion, disponible, ingredientes, tiempo_preparacion, vegetariano, picante } = req.body;
    
    const result = await client.query(
      `UPDATE menu_items 
       SET nombre = $1, precio = $2, categoria_id = $3, descripcion = $4, 
           disponible = $5, ingredientes = $6, tiempo_preparacion = $7, vegetariano = $8, picante = $9, fecha_modificacion = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [nombre, precio, categoria_id, descripcion, disponible, ingredientes, tiempo_preparacion, vegetariano || false, picante || false, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Eliminar producto
app.delete('/api/menu/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('DELETE FROM menu_items WHERE id = $1 RETURNING nombre', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Cambiar disponibilidad de producto
app.patch('/api/menu/:id/disponibilidad', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { disponible } = req.body;
    
    const result = await client.query(
      'UPDATE menu_items SET disponible = $1, fecha_modificacion = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [disponible, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// PLATOS ESPECIALES
// =====================================================
app.get('/api/platos-especiales', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM platos_especiales 
      WHERE disponible = true 
      AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/platos-especiales', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, precio, descripcion, fecha_fin, tiempo_preparacion, vegetariano, picante } = req.body;
    
    const result = await client.query(
      `INSERT INTO platos_especiales (nombre, precio, descripcion, fecha_fin, tiempo_preparacion, vegetariano, picante) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [nombre, precio, descripcion || null, fecha_fin || null, tiempo_preparacion || 0, vegetariano || false, picante || false]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/platos-especiales/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, precio, descripcion, disponible, fecha_fin, tiempo_preparacion, vegetariano, picante } = req.body;
    
    const result = await client.query(
      `UPDATE platos_especiales 
       SET nombre = $1, precio = $2, descripcion = $3, disponible = $4, 
           fecha_fin = $5, tiempo_preparacion = $6, vegetariano = $7, picante = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [nombre, precio, descripcion, disponible, fecha_fin, tiempo_preparacion, vegetariano || false, picante || false, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Special dish not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/platos-especiales/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('DELETE FROM platos_especiales WHERE id = $1 RETURNING nombre', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Special dish not found' });
    }
    
    res.json({ success: true, message: 'Special dish deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

app.patch('/api/platos-especiales/:id/disponibilidad', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { disponible } = req.body;
    
    const result = await client.query(
      'UPDATE platos_especiales SET disponible = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [disponible, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Special dish not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// PEDIDOS/ÓRDENES
// =====================================================
app.post('/api/ordenes', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { mesa, items, total, metodo_pago } = req.body;
    const usuario_id = req.user?.id || 1;
    
    const ordenResult = await client.query(
      `INSERT INTO ordenes (usuario_id, total, estado, metodo_pago, mesa, tipo_orden) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [usuario_id, total, 'entregada', metodo_pago || 'efectivo', mesa, 'mesa']
    );
    
    const orden = ordenResult.rows[0];
    
    for (const item of items) {
      if (item.es_plato_especial) {
        await client.query(
          `INSERT INTO orden_items (orden_id, plato_especial_id, cantidad, precio_unitario) 
           VALUES ($1, $2, $3, $4)`,
          [orden.id, item.id, item.cantidad, item.precio]
        );
      } else {
        await client.query(
          `INSERT INTO orden_items (orden_id, menu_item_id, cantidad, precio_unitario) 
           VALUES ($1, $2, $3, $4)`,
          [orden.id, item.id, item.cantidad, item.precio]
        );
      }
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Orden creada exitosamente',
      orden: orden
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// MESAS
// =====================================================
app.get('/api/mesas', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT m.*, 
             COUNT(o.id) as pedidos_pendientes,
             COALESCE(SUM(o.total), 0) as total_pendiente
      FROM mesas m
      LEFT JOIN ordenes o ON m.numero::text = o.mesa AND o.estado IN ('pendiente', 'confirmada')
      WHERE m.disponible = true
      GROUP BY m.id
      ORDER BY m.numero
    `);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// REPORTES (Básicos)
// =====================================================
app.get('/api/reportes/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Endpoints de reportes funcionando',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/reportes/ventas', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT o.*, u.nombre as cliente_nombre
      FROM ordenes o
      JOIN usuarios u ON o.usuario_id = u.id
      WHERE o.estado = 'entregada'
      ORDER BY o.fecha_creacion DESC
      LIMIT 100
    `);
    
    res.json({
      success: true,
      ventas: result.rows,
      estadisticas: {
        total_ventas: result.rows.reduce((sum, venta) => sum + parseFloat(venta.total), 0),
        numero_ordenes: result.rows.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/reportes/productos-populares', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        COALESCE(m.nombre, pe.nombre) as nombre,
        SUM(oi.cantidad) as total_vendido
      FROM orden_items oi
      LEFT JOIN menu_items m ON oi.menu_item_id = m.id
      LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
      GROUP BY COALESCE(m.nombre, pe.nombre)
      ORDER BY total_vendido DESC
      LIMIT 10
    `);
    
    res.json({ success: true, productos: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/reportes/mesas', authMiddleware, async (req, res) => {
  res.json({ success: true, mesas: [] });
});

app.get('/api/reportes/dashboard', authMiddleware, async (req, res) => {
  res.json({ success: true, estadisticas: {} });
});

app.get('/api/reportes/exportar', authMiddleware, async (req, res) => {
  res.json({ success: true, message: 'Función de exportación en desarrollo' });
});

// =====================================================
// ERROR HANDLERS
// =====================================================
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /api/health',
      'POST /api/auth/login', 
      'POST /api/auth/register',
      'GET /api/auth/verify',
      'GET /api/menu',
      'GET /api/menu/sync',
      'GET /api/sync',
      'GET /api/categorias',
      'GET /api/platos-especiales',
      'POST /api/platos-especiales',
      'PUT /api/platos-especiales/:id',
      'DELETE /api/platos-especiales/:id',
      'PATCH /api/platos-especiales/:id/disponibilidad',
      'POST /api/menu',
      'PUT /api/menu/:id',
      'DELETE /api/menu/:id',
      'PATCH /api/menu/:id/disponibilidad',
      'POST /api/ordenes',
      'GET /api/mesas',
      'GET /api/reportes/*'
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('💥 Error global:', err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// =====================================================
// INICIALIZACIÓN
// =====================================================

// 🌐 ACTUALIZAR LA FUNCIÓN startServer PARA MOSTRAR IPs
async function startServer() {
  try {
    console.log('🚀 Iniciando servidor del restaurante con Supabase...');
    
    if (!process.env.DB_PASSWORD) {
      console.error('❌ DB_PASSWORD no está configurado');
      process.exit(1);
    }
    
    // Test de conexión
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    console.log('✅ Conexión a Supabase exitosa');
    client.release();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🎉 Servidor corriendo en puerto ${PORT}`);
      console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`☁️ Base de datos: Supabase PostgreSQL`);
      
      // 🔧 MOSTRAR TUS IPs FIJAS AUTORIZADAS
      console.log(`\n🌐 IPs fijas autorizadas para CORS:`);
      console.log(`   • Principal: http://44.226.145.213:${PORT}/api`);
      console.log(`   • Backup 1:  http://54.187.200.255:${PORT}/api`);
      console.log(`   • Backup 2:  http://34.213.214.55:${PORT}/api`);
      console.log(`   • Backup 3:  http://35.164.95.156:${PORT}/api`);
      console.log(`   • Backup 4:  http://44.230.95.183:${PORT}/api`);
      console.log(`   • Backup 5:  http://44.229.200.200:${PORT}/api`);
      
      console.log(`\n📱 Para tu app React Native, usa:`);
      console.log(`   API_BASE_URL = 'http://44.226.145.213:${PORT}/api'`);
      
      console.log(`\n📡 Endpoints principales:`);
      console.log(`   • GET  /api/health`);
      console.log(`   • GET  /api/menu/sync`);
      console.log(`   • GET  /api/sync`);
      console.log(`   • POST /api/auth/login`);
      console.log(`   • GET  /api/categorias`);
      console.log(`   • GET  /api/platos-especiales`);
      console.log(`\n✅ Servidor listo para recibir peticiones desde las IPs autorizadas!`);
    });

    const gracefulShutdown = (signal) => {
      console.log(`\n📡 Recibida señal ${signal}, cerrando servidor...`);
      server.close(() => {
        pool.end().then(() => {
          console.log('☁️ Conexiones cerradas');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, pool };
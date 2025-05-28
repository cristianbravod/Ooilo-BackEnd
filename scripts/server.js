// server.js
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:19000', // Expo Metro Bundler
    'http://localhost:19001', // Expo DevTools
    'http://localhost:19006', // Expo Web
    // Agregar tu IP local aquí para Expo en dispositivos móviles
    // Ejemplo: 'http://192.168.1.100:19000'
    process.env.EXPO_URL || 'http://192.168.1.100:19000',
    `exp://${process.env.LOCAL_IP || 'localhost'}:19000`,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Logging middleware para debug
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'restaurant_db',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to PostgreSQL:', err);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

// Middleware de autenticación
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Admin middleware
const adminMiddleware = (req, res, next) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// AUTH ROUTES
// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, email, password, telefono, direccion } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await client.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await client.query(
      'INSERT INTO usuarios (nombre, email, password, telefono, direccion, rol) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, email, telefono, direccion, rol',
      [nombre, email, hashedPassword, telefono, direccion, 'cliente']
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        telefono: user.telefono,
        direccion: user.direccion,
        rol: user.rol
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password } = req.body;

    const result = await client.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        telefono: user.telefono,
        direccion: user.direccion,
        rol: user.rol
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// CATEGORY ROUTES
// Obtener todas las categorías
app.get('/api/categorias', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM categorias WHERE activo = true ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Crear categoría (Admin)
app.post('/api/categorias', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, descripcion, imagen } = req.body;
    const result = await client.query(
      'INSERT INTO categorias (nombre, descripcion, imagen) VALUES ($1, $2, $3) RETURNING *',
      [nombre, descripcion, imagen]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// MENU ROUTES
// Obtener todos los items del menú con filtros
app.get('/api/menu', async (req, res) => {
  const client = await pool.connect();
  try {
    const { categoria_id, vegetariano, picante } = req.query;
    
    let query = `
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.disponible = true AND c.activo = true
    `;
    const params = [];
    let paramCount = 0;

    if (categoria_id) {
      paramCount++;
      query += ` AND m.categoria_id = $${paramCount}`;
      params.push(categoria_id);
    }

    if (vegetariano === 'true') {
      query += ` AND m.vegetariano = true`;
    }

    if (picante === 'true') {
      query += ` AND m.picante = true`;
    }

    query += ' ORDER BY c.nombre, m.nombre';

    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Obtener item específico del menú
app.get('/api/menu/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT m.*, c.nombre as categoria_nombre 
       FROM menu_items m 
       JOIN categorias c ON m.categoria_id = c.id 
       WHERE m.id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Menu item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Crear item del menú (Admin)
app.post('/api/menu', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, descripcion, precio, categoria_id, imagen, ingredientes, vegetariano, picante, tiempo_preparacion } = req.body;
    
    const result = await client.query(
      `INSERT INTO menu_items (nombre, descripcion, precio, categoria_id, imagen, ingredientes, vegetariano, picante, tiempo_preparacion) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nombre, descripcion, precio, categoria_id, imagen, ingredientes, vegetariano || false, picante || false, tiempo_preparacion]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Actualizar item del menú (Admin)
app.put('/api/menu/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, descripcion, precio, categoria_id, imagen, ingredientes, vegetariano, picante, tiempo_preparacion, disponible } = req.body;
    
    const result = await client.query(
      `UPDATE menu_items 
       SET nombre = $1, descripcion = $2, precio = $3, categoria_id = $4, imagen = $5, 
           ingredientes = $6, vegetariano = $7, picante = $8, tiempo_preparacion = $9, disponible = $10,
           fecha_modificacion = CURRENT_TIMESTAMP
       WHERE id = $11 RETURNING *`,
      [nombre, descripcion, precio, categoria_id, imagen, ingredientes, vegetariano, picante, tiempo_preparacion, disponible, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Menu item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// ORDER ROUTES
// Crear orden
app.post('/api/ordenes', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { items, direccion_entrega, metodo_pago, notas } = req.body;
    
    // Calcular total
    let total = 0;
    for (const item of items) {
      const menuItem = await client.query('SELECT precio FROM menu_items WHERE id = $1', [item.menu_item_id]);
      if (menuItem.rows.length === 0) {
        throw new Error(`Menu item with id ${item.menu_item_id} not found`);
      }
      total += menuItem.rows[0].precio * item.cantidad;
    }
    
    // Crear orden
    const ordenResult = await client.query(
      `INSERT INTO ordenes (usuario_id, total, direccion_entrega, metodo_pago, notas) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, total, direccion_entrega, metodo_pago, notas]
    );
    
    const orden = ordenResult.rows[0];
    
    // Crear items de la orden
    for (const item of items) {
      const menuItem = await client.query('SELECT precio FROM menu_items WHERE id = $1', [item.menu_item_id]);
      await client.query(
        `INSERT INTO orden_items (orden_id, menu_item_id, cantidad, precio_unitario, instrucciones_especiales) 
         VALUES ($1, $2, $3, $4, $5)`,
        [orden.id, item.menu_item_id, item.cantidad, menuItem.rows[0].precio, item.instrucciones_especiales]
      );
    }
    
    await client.query('COMMIT');
    
    // Obtener orden completa con items
    const ordenCompleta = await client.query(
      `SELECT o.*, u.nombre as usuario_nombre, u.telefono as usuario_telefono
       FROM ordenes o
       JOIN usuarios u ON o.usuario_id = u.id
       WHERE o.id = $1`,
      [orden.id]
    );
    
    const itemsOrden = await client.query(
      `SELECT oi.*, m.nombre as menu_item_nombre
       FROM orden_items oi
       JOIN menu_items m ON oi.menu_item_id = m.id
       WHERE oi.orden_id = $1`,
      [orden.id]
    );
    
    res.status(201).json({
      ...ordenCompleta.rows[0],
      items: itemsOrden.rows
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Obtener órdenes del usuario
app.get('/api/ordenes/mis-ordenes', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const ordenes = await client.query(
      `SELECT * FROM ordenes WHERE usuario_id = $1 ORDER BY fecha_creacion DESC`,
      [req.user.id]
    );
    
    // Obtener items para cada orden
    for (let orden of ordenes.rows) {
      const items = await client.query(
        `SELECT oi.*, m.nombre as menu_item_nombre, m.imagen as menu_item_imagen
         FROM orden_items oi
         JOIN menu_items m ON oi.menu_item_id = m.id
         WHERE oi.orden_id = $1`,
        [orden.id]
      );
      orden.items = items.rows;
    }
    
    res.json(ordenes.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Obtener todas las órdenes (Admin)
app.get('/api/ordenes', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { estado, fecha } = req.query;
    
    let query = `
      SELECT o.*, u.nombre as usuario_nombre, u.telefono as usuario_telefono, u.email as usuario_email
      FROM ordenes o
      JOIN usuarios u ON o.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (estado) {
      paramCount++;
      query += ` AND o.estado = $${paramCount}`;
      params.push(estado);
    }
    
    if (fecha) {
      paramCount++;
      query += ` AND DATE(o.fecha_creacion) = $${paramCount}`;
      params.push(fecha);
    }
    
    query += ' ORDER BY o.fecha_creacion DESC';
    
    const ordenes = await client.query(query, params);
    
    // Obtener items para cada orden
    for (let orden of ordenes.rows) {
      const items = await client.query(
        `SELECT oi.*, m.nombre as menu_item_nombre, m.imagen as menu_item_imagen
         FROM orden_items oi
         JOIN menu_items m ON oi.menu_item_id = m.id
         WHERE oi.orden_id = $1`,
        [orden.id]
      );
      orden.items = items.rows;
    }
    
    res.json(ordenes.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Actualizar estado de orden (Admin)
app.put('/api/ordenes/:id/estado', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { estado } = req.body;
    const result = await client.query(
      'UPDATE ordenes SET estado = $1, fecha_modificacion = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [estado, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// TABLE ROUTES
// Obtener todas las mesas
app.get('/api/mesas', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM mesas ORDER BY numero');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Crear mesa (Admin)
app.post('/api/mesas', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { numero, capacidad, ubicacion } = req.body;
    const result = await client.query(
      'INSERT INTO mesas (numero, capacidad, ubicacion) VALUES ($1, $2, $3) RETURNING *',
      [numero, capacidad, ubicacion]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// RESERVATION ROUTES
// Crear reservación
app.post('/api/reservaciones', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { mesa_id, fecha, hora, numero_personas, solicitudes_especiales } = req.body;
    
    // Verificar disponibilidad de mesa
    const existingReservation = await client.query(
      'SELECT * FROM reservaciones WHERE mesa_id = $1 AND fecha = $2 AND hora = $3 AND estado IN ($4, $5)',
      [mesa_id, fecha, hora, 'pendiente', 'confirmada']
    );
    
    if (existingReservation.rows.length > 0) {
      return res.status(400).json({ message: 'Table not available at this time' });
    }
    
    const result = await client.query(
      `INSERT INTO reservaciones (usuario_id, mesa_id, fecha, hora, numero_personas, solicitudes_especiales) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, mesa_id, fecha, hora, numero_personas, solicitudes_especiales]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Obtener reservaciones del usuario
app.get('/api/reservaciones/mis-reservaciones', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT r.*, m.numero as mesa_numero, m.capacidad as mesa_capacidad, m.ubicacion as mesa_ubicacion
       FROM reservaciones r
       JOIN mesas m ON r.mesa_id = m.id
       WHERE r.usuario_id = $1
       ORDER BY r.fecha DESC, r.hora DESC`,
      [req.user.id]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// USER ROUTES
// Obtener perfil del usuario
app.get('/api/usuario/perfil', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, nombre, email, telefono, direccion, rol, fecha_creacion FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Actualizar perfil del usuario
app.put('/api/usuario/perfil', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, telefono, direccion } = req.body;
    const result = await client.query(
      'UPDATE usuarios SET nombre = $1, telefono = $2, direccion = $3, fecha_modificacion = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, nombre, email, telefono, direccion, rol',
      [nombre, telefono, direccion, req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// DASHBOARD ROUTES (Admin)
// Estadísticas del dashboard
app.get('/api/dashboard/estadisticas', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [
      totalOrdenes,
      ordenesHoy,
      ingresoTotal,
      ingresoHoy,
      ordenesPendientes,
      totalUsuarios,
      totalMenuItems,
      totalMesas
    ] = await Promise.all([
      client.query('SELECT COUNT(*) FROM ordenes'),
      client.query('SELECT COUNT(*) FROM ordenes WHERE DATE(fecha_creacion) = $1', [today]),
      client.query('SELECT SUM(total) FROM ordenes WHERE estado = $1', ['entregada']),
      client.query('SELECT SUM(total) FROM ordenes WHERE estado = $1 AND DATE(fecha_creacion) = $2', ['entregada', today]),
      client.query('SELECT COUNT(*) FROM ordenes WHERE estado = $1', ['pendiente']),
      client.query('SELECT COUNT(*) FROM usuarios'),
      client.query('SELECT COUNT(*) FROM menu_items'),
      client.query('SELECT COUNT(*) FROM mesas')
    ]);

    res.json({
      totalOrdenes: parseInt(totalOrdenes.rows[0].count),
      ordenesHoy: parseInt(ordenesHoy.rows[0].count),
      ingresoTotal: parseFloat(ingresoTotal.rows[0].sum) || 0,
      ingresoHoy: parseFloat(ingresoHoy.rows[0].sum) || 0,
      ordenesPendientes: parseInt(ordenesPendientes.rows[0].count),
      totalUsuarios: parseInt(totalUsuarios.rows[0].count),
      totalMenuItems: parseInt(totalMenuItems.rows[0].count),
      totalMesas: parseInt(totalMesas.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
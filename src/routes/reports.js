// src/routes/reports.js
const express = require('express');
const { Pool } = require('pg');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const config = require('../config/database');

const router = express.Router();
const pool = new Pool(config);

// Reporte de ventas por período
router.get('/ventas', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, mesa, producto } = req.query;
    
    let query = `
      SELECT 
        o.id as orden_id,
        o.mesa,
        o.total,
        o.estado,
        o.fecha_creacion,
        oi.cantidad,
        oi.precio_unitario,
        m.nombre as producto_nombre,
        c.nombre as categoria_nombre,
        u.nombre as cliente_nombre
      FROM ordenes o
      JOIN orden_items oi ON o.id = oi.orden_id
      JOIN menu_items m ON oi.menu_item_id = m.id
      JOIN categorias c ON m.categoria_id = c.id
      JOIN usuarios u ON o.usuario_id = u.id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    if (fecha_inicio && fecha_fin) {
      paramCount += 2;
      query += ` AND DATE(o.fecha_creacion) BETWEEN $${paramCount - 1} AND $${paramCount}`;
      params.push(fecha_inicio, fecha_fin);
    }

    if (mesa) {
      paramCount++;
      query += ` AND o.mesa = $${paramCount}`;
      params.push(mesa);
    }

    if (producto) {
      paramCount++;
      query += ` AND LOWER(m.nombre) LIKE LOWER($${paramCount})`;
      params.push(`%${producto}%`);
    }

    query += ' ORDER BY o.fecha_creacion DESC';

    const result = await pool.query(query, params);
    
    // Calcular estadísticas
    const totalVentas = result.rows.reduce((sum, row) => sum + parseFloat(row.total), 0);
    const totalItems = result.rows.reduce((sum, row) => sum + parseInt(row.cantidad), 0);

    res.json({
      ventas: result.rows,
      estadisticas: {
        total_ventas: totalVentas,
        total_items: totalItems,
        numero_ordenes: new Set(result.rows.map(r => r.orden_id)).size,
        promedio_orden: result.rows.length > 0 ? totalVentas / new Set(result.rows.map(r => r.orden_id)).size : 0
      }
    });
  } catch (error) {
    console.error('Error getting sales report:', error);
    res.status(500).json({ message: 'Error retrieving sales report', error: error.message });
  }
});

// Productos más vendidos
router.get('/productos-populares', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, limit = 10 } = req.query;
    
    let query = `
      SELECT 
        m.id,
        m.nombre,
        m.precio,
        c.nombre as categoria,
        SUM(oi.cantidad) as total_vendido,
        SUM(oi.cantidad * oi.precio_unitario) as ingresos_totales,
        COUNT(DISTINCT o.id) as ordenes_count
      FROM menu_items m
      JOIN categorias c ON m.categoria_id = c.id
      JOIN orden_items oi ON m.id = oi.menu_item_id
      JOIN ordenes o ON oi.orden_id = o.id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    if (fecha_inicio && fecha_fin) {
      paramCount += 2;
      query += ` AND DATE(o.fecha_creacion) BETWEEN $${paramCount - 1} AND $${paramCount}`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += `
      GROUP BY m.id, m.nombre, m.precio, c.nombre
      ORDER BY total_vendido DESC
      LIMIT $${paramCount + 1}
    `;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting popular products:', error);
    res.status(500).json({ message: 'Error retrieving popular products', error: error.message });
  }
});

// Reporte por mesas
router.get('/mesas', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    
    let query = `
      SELECT 
        o.mesa,
        COUNT(*) as total_ordenes,
        SUM(o.total) as ingresos_totales,
        AVG(o.total) as promedio_orden,
        SUM(oi.cantidad) as total_items
      FROM ordenes o
      JOIN orden_items oi ON o.id = oi.orden_id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    if (fecha_inicio && fecha_fin) {
      paramCount += 2;
      query += ` AND DATE(o.fecha_creacion) BETWEEN $${paramCount - 1} AND $${paramCount}`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += ' GROUP BY o.mesa ORDER BY ingresos_totales DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting table report:', error);
    res.status(500).json({ message: 'Error retrieving table report', error: error.message });
  }
});

// Estadísticas del dashboard
router.get('/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const queries = [
      // Órdenes de hoy
      `SELECT COUNT(*) as ordenes_hoy FROM ordenes WHERE DATE(fecha_creacion) = $1`,
      
      // Ingresos de hoy
      `SELECT COALESCE(SUM(total), 0) as ingresos_hoy FROM ordenes WHERE estado = 'entregada' AND DATE(fecha_creacion) = $1`,
      
      // Órdenes pendientes
      `SELECT COUNT(*) as ordenes_pendientes FROM ordenes WHERE estado IN ('pendiente', 'confirmada', 'preparando')`,
      
      // Producto más vendido hoy
      `SELECT m.nombre, SUM(oi.cantidad) as cantidad
       FROM orden_items oi
       JOIN menu_items m ON oi.menu_item_id = m.id
       JOIN ordenes o ON oi.orden_id = o.id
       WHERE o.estado = 'entregada' AND DATE(o.fecha_creacion) = $1
       GROUP BY m.id, m.nombre
       ORDER BY cantidad DESC
       LIMIT 1`,
       
      // Total de items del menú activos
      `SELECT COUNT(*) as items_menu FROM menu_items WHERE disponible = true`
    ];

    const results = await Promise.all(
      queries.map(query => pool.query(query, [today]))
    );

    res.json({
      ordenes_hoy: parseInt(results[0].rows[0].ordenes_hoy),
      ingresos_hoy: parseFloat(results[1].rows[0].ingresos_hoy),
      ordenes_pendientes: parseInt(results[2].rows[0].ordenes_pendientes),
      producto_mas_vendido: results[3].rows[0] || null,
      items_menu_activos: parseInt(results[4].rows[0].items_menu),
      fecha: today
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ message: 'Error retrieving dashboard statistics', error: error.message });
  }
});

module.exports = router;
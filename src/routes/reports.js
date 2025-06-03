// src/routes/reports.js - Rutas completas para reportes
const express = require('express');
const { Pool } = require('pg');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const config = require('../config/database');

const router = express.Router();
const pool = new Pool(config);

// =====================================================
// RUTAS PRINCIPALES DE REPORTES
// =====================================================

// Reporte de ventas por período
router.get('/ventas', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      fecha_inicio, 
      fecha_fin, 
      mesa, 
      producto, 
      categoria,
      limit = 1000,
      offset = 0 
    } = req.query;
    
    console.log('📊 Generando reporte de ventas:', req.query);
    
    let query = `
      SELECT 
        o.id as orden_id,
        o.mesa,
        o.total,
        o.estado,
        o.fecha_creacion as fecha,
        o.metodo_pago,
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

    if (categoria) {
      paramCount++;
      query += ` AND LOWER(c.nombre) = LOWER($${paramCount})`;
      params.push(categoria);
    }

    query += ' ORDER BY o.fecha_creacion DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }

    if (offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(parseInt(offset));
    }

    const result = await client.query(query, params);
    
    // Agrupar datos por orden
    const ventasAgrupadas = {};
    result.rows.forEach(row => {
      const ordenId = row.orden_id;
      if (!ventasAgrupadas[ordenId]) {
        ventasAgrupadas[ordenId] = {
          id: ordenId,
          mesa: row.mesa,
          fecha: row.fecha,
          total: parseFloat(row.total),
          estado: row.estado,
          metodo_pago: row.metodo_pago,
          cliente_nombre: row.cliente_nombre,
          items: []
        };
      }
      
      ventasAgrupadas[ordenId].items.push({
        nombre: row.producto_nombre,
        cantidad: parseInt(row.cantidad),
        precio: parseFloat(row.precio_unitario),
        categoria: row.categoria_nombre
      });
    });

    const ventasFinales = Object.values(ventasAgrupadas);
    
    // Calcular estadísticas
    const totalVentas = ventasFinales.reduce((sum, venta) => sum + venta.total, 0);
    const totalItems = result.rows.reduce((sum, row) => sum + parseInt(row.cantidad), 0);
    const numeroOrdenes = ventasFinales.length;

    res.json({
      success: true,
      ventas: ventasFinales,
      estadisticas: {
        total_ventas: totalVentas,
        total_items: totalItems,
        numero_ordenes: numeroOrdenes,
        promedio_orden: numeroOrdenes > 0 ? totalVentas / numeroOrdenes : 0,
        periodo: {
          fecha_inicio,
          fecha_fin,
          filtros_aplicados: {
            mesa: mesa || null,
            producto: producto || null,
            categoria: categoria || null
          }
        }
      },
      meta: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total_registros: result.rows.length
      }
    });
  } catch (error) {
    console.error('Error getting sales report:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving sales report', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Productos más vendidos
router.get('/productos-populares', authMiddleware, async (req, res) => {
  const client = await pool.connect();
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
        COUNT(DISTINCT o.id) as ordenes_count,
        AVG(oi.precio_unitario) as precio_promedio
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
    params.push(parseInt(limit));

    const result = await client.query(query, params);
    
    res.json({
      success: true,
      productos: result.rows.map(row => ({
        ...row,
        total_vendido: parseInt(row.total_vendido),
        ingresos_totales: parseFloat(row.ingresos_totales),
        ordenes_count: parseInt(row.ordenes_count),
        precio_promedio: parseFloat(row.precio_promedio)
      }))
    });
  } catch (error) {
    console.error('Error getting popular products:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving popular products', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Reporte por mesas
router.get('/mesas', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    
    let query = `
      SELECT 
        o.mesa,
        COUNT(DISTINCT o.id) as total_ordenes,
        SUM(o.total) as ingresos_totales,
        AVG(o.total) as promedio_orden,
        SUM(oi.cantidad) as total_items,
        COUNT(DISTINCT o.usuario_id) as clientes_unicos
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

    const result = await client.query(query, params);
    
    res.json({
      success: true,
      mesas: result.rows.map(row => ({
        ...row,
        total_ordenes: parseInt(row.total_ordenes),
        ingresos_totales: parseFloat(row.ingresos_totales),
        promedio_orden: parseFloat(row.promedio_orden),
        total_items: parseInt(row.total_items),
        clientes_unicos: parseInt(row.clientes_unicos)
      }))
    });
  } catch (error) {
    console.error('Error getting table report:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving table report', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Estadísticas del dashboard
router.get('/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    
    const queries = [
      // Órdenes de hoy
      `SELECT COUNT(*) as ordenes_hoy FROM ordenes WHERE DATE(fecha_creacion) = $1`,
      
      // Ingresos de hoy
      `SELECT COALESCE(SUM(total), 0) as ingresos_hoy FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) = $1`,
      
      // Órdenes pendientes
      `SELECT COUNT(*) as ordenes_pendientes FROM ordenes 
       WHERE estado IN ('pendiente', 'confirmada', 'preparando')`,
      
      // Órdenes del mes
      `SELECT COUNT(*) as ordenes_mes FROM ordenes 
       WHERE DATE(fecha_creacion) >= $2`,
       
      // Ingresos del mes
      `SELECT COALESCE(SUM(total), 0) as ingresos_mes FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) >= $2`,
      
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
      `SELECT COUNT(*) as items_menu FROM menu_items WHERE disponible = true`,

      // Promedio de orden hoy
      `SELECT AVG(total) as promedio_orden_hoy FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) = $1`,

      // Mesa más productiva del mes
      `SELECT o.mesa, SUM(o.total) as ingresos FROM ordenes o
       WHERE o.estado = 'entregada' AND DATE(o.fecha_creacion) >= $2
       GROUP BY o.mesa ORDER BY ingresos DESC LIMIT 1`
    ];

    const results = await Promise.all(
      queries.map(query => client.query(query, [today, startOfMonth]))
    );

    res.json({
      success: true,
      estadisticas: {
        hoy: {
          ordenes: parseInt(results[0].rows[0].ordenes_hoy),
          ingresos: parseFloat(results[1].rows[0].ingresos_hoy),
          promedio_orden: parseFloat(results[7].rows[0].promedio_orden_hoy) || 0
        },
        mes: {
          ordenes: parseInt(results[3].rows[0].ordenes_mes),
          ingresos: parseFloat(results[4].rows[0].ingresos_mes)
        },
        pendientes: {
          ordenes: parseInt(results[2].rows[0].ordenes_pendientes)
        },
        menu: {
          items_activos: parseInt(results[6].rows[0].items_menu)
        },
        destacado: {
          producto_mas_vendido: results[5].rows[0] || null,
          mesa_mas_productiva: results[8].rows[0] || null
        },
        fecha_generacion: new Date().toISOString(),
        periodo: {
          hoy: today,
          inicio_mes: startOfMonth
        }
      }
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving dashboard statistics', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE EXPORTACIÓN
// =====================================================

// Exportar datos
router.get('/exportar', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      formato = 'json', 
      tipo = 'ventas',
      fecha_inicio,
      fecha_fin,
      mesa,
      producto
    } = req.query;
    
    let data = {};
    
    if (tipo === 'ventas') {
      // Obtener datos de ventas para exportación
      let query = `
        SELECT 
          o.mesa,
          o.fecha_creacion as fecha,
          o.total as total_orden,
          o.metodo_pago,
          oi.cantidad,
          oi.precio_unitario,
          m.nombre as producto,
          c.nombre as categoria,
          u.nombre as cliente
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

      query += ' ORDER BY o.fecha_creacion DESC LIMIT 5000';

      const result = await client.query(query, params);
      data = {
        tipo: 'ventas',
        fecha_generacion: new Date().toISOString(),
        filtros: { fecha_inicio, fecha_fin, mesa, producto },
        total_registros: result.rows.length,
        datos: result.rows
      };
    }

    if (formato === 'csv') {
      // Convertir a CSV
      const headers = ['Mesa', 'Fecha', 'Producto', 'Categoria', 'Cantidad', 'Precio_Unitario', 'Subtotal', 'Total_Orden', 'Metodo_Pago', 'Cliente'];
      const rows = data.datos.map(row => [
        row.mesa,
        new Date(row.fecha).toLocaleDateString(),
        row.producto,
        row.categoria,
        row.cantidad,
        row.precio_unitario,
        row.cantidad * row.precio_unitario,
        row.total_orden,
        row.metodo_pago,
        row.cliente
      ]);
      
      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');
        
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="reporte_${tipo}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      // JSON por defecto
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="reporte_${tipo}_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(data);
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error exporting data', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE ANÁLISIS AVANZADO
// =====================================================

// Ventas por período específico
router.get('/ventas-periodo', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { periodo = 'dia' } = req.query;
    
    let groupBy, dateFormat, intervalCondition;
    switch (periodo) {
      case 'hora':
        groupBy = "DATE_TRUNC('hour', o.fecha_creacion)";
        dateFormat = 'HH24:00';
        intervalCondition = "o.fecha_creacion >= CURRENT_DATE - INTERVAL '1 day'";
        break;
      case 'dia':
        groupBy = "DATE(o.fecha_creacion)";
        dateFormat = 'DD/MM/YYYY';
        intervalCondition = "o.fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'semana':
        groupBy = "DATE_TRUNC('week', o.fecha_creacion)";
        dateFormat = 'DD/MM/YYYY';
        intervalCondition = "o.fecha_creacion >= CURRENT_DATE - INTERVAL '12 weeks'";
        break;
      case 'mes':
        groupBy = "DATE_TRUNC('month', o.fecha_creacion)";
        dateFormat = 'MM/YYYY';
        intervalCondition = "o.fecha_creacion >= CURRENT_DATE - INTERVAL '12 months'";
        break;
      default:
        groupBy = "DATE(o.fecha_creacion)";
        dateFormat = 'DD/MM/YYYY';
        intervalCondition = "o.fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'";
    }

    const query = `
      SELECT 
        ${groupBy} as periodo,
        TO_CHAR(${groupBy}, '${dateFormat}') as periodo_formato,
        COUNT(*) as total_ordenes,
        SUM(o.total) as ingresos_totales,
        AVG(o.total) as promedio_orden,
        COUNT(DISTINCT o.mesa) as mesas_activas
      FROM ordenes o
      WHERE o.estado = 'entregada' AND ${intervalCondition}
      GROUP BY ${groupBy}
      ORDER BY periodo DESC
      LIMIT 50
    `;

    const result = await client.query(query);
    
    res.json({
      success: true,
      periodo,
      datos: result.rows.map(row => ({
        periodo: row.periodo,
        periodo_formato: row.periodo_formato,
        total_ordenes: parseInt(row.total_ordenes),
        ingresos_totales: parseFloat(row.ingresos_totales),
        promedio_orden: parseFloat(row.promedio_orden),
        mesas_activas: parseInt(row.mesas_activas)
      }))
    });
  } catch (error) {
    console.error('Error getting sales by period:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving sales by period', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Análisis de tendencias
router.get('/tendencias', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    
    // Análisis de tendencias de ventas
    const ventasPorDia = await client.query(`
      SELECT 
        DATE(fecha_creacion) as fecha,
        COUNT(*) as ordenes,
        SUM(total) as ingresos,
        AVG(total) as promedio
      FROM ordenes 
      WHERE estado = 'entregada' 
      AND fecha_creacion >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
      AND fecha_creacion <= COALESCE($2::date, CURRENT_DATE)
      GROUP BY DATE(fecha_creacion)
      ORDER BY fecha
    `, [fecha_inicio, fecha_fin]);

    // Tendencias de productos
    const productosTendencia = await client.query(`
      SELECT 
        m.nombre,
        DATE(o.fecha_creacion) as fecha,
        SUM(oi.cantidad) as cantidad_vendida
      FROM menu_items m
      JOIN orden_items oi ON m.id = oi.menu_item_id
      JOIN ordenes o ON oi.orden_id = o.id
      WHERE o.estado = 'entregada'
      AND o.fecha_creacion >= COALESCE($1::date, CURRENT_DATE - INTERVAL '30 days')
      AND o.fecha_creacion <= COALESCE($2::date, CURRENT_DATE)
      GROUP BY m.nombre, DATE(o.fecha_creacion)
      ORDER BY fecha, cantidad_vendida DESC
    `, [fecha_inicio, fecha_fin]);

    res.json({
      success: true,
      tendencias: {
        ventas_por_dia: ventasPorDia.rows,
        productos: productosTendencia.rows,
        periodo: { fecha_inicio, fecha_fin }
      }
    });
  } catch (error) {
    console.error('Error getting trends:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving trends analysis', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE RESUMEN RÁPIDO
// =====================================================

// Resumen del día actual
router.get('/resumen-hoy', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT 
        COUNT(DISTINCT o.id) as ordenes_hoy,
        COALESCE(SUM(o.total), 0) as ingresos_hoy,
        COUNT(DISTINCT o.mesa) as mesas_activas,
        SUM(oi.cantidad) as items_vendidos,
        AVG(o.total) as promedio_orden
      FROM ordenes o
      LEFT JOIN orden_items oi ON o.id = oi.orden_id
      WHERE DATE(o.fecha_creacion) = $1 AND o.estado = 'entregada'
    `;
    
    const result = await client.query(query, [today]);
    const datos = result.rows[0];
    
    res.json({
      success: true,
      fecha: today,
      resumen: {
        ordenes_hoy: parseInt(datos.ordenes_hoy) || 0,
        ingresos_hoy: parseFloat(datos.ingresos_hoy) || 0,
        mesas_activas: parseInt(datos.mesas_activas) || 0,
        items_vendidos: parseInt(datos.items_vendidos) || 0,
        promedio_orden: parseFloat(datos.promedio_orden) || 0
      }
    });
  } catch (error) {
    console.error('Error getting daily summary:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving daily summary', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// Top productos del día
router.get('/top-productos-hoy', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT 
        m.nombre,
        c.nombre as categoria,
        SUM(oi.cantidad) as cantidad_vendida,
        SUM(oi.cantidad * oi.precio_unitario) as ingresos
      FROM menu_items m
      JOIN categorias c ON m.categoria_id = c.id
      JOIN orden_items oi ON m.id = oi.menu_item_id
      JOIN ordenes o ON oi.orden_id = o.id
      WHERE DATE(o.fecha_creacion) = $1 AND o.estado = 'entregada'
      GROUP BY m.id, m.nombre, c.nombre
      ORDER BY cantidad_vendida DESC
      LIMIT 5
    `;
    
    const result = await client.query(query, [today]);
    
    res.json({
      success: true,
      fecha: today,
      productos: result.rows.map(row => ({
        nombre: row.nombre,
        categoria: row.categoria,
        cantidad_vendida: parseInt(row.cantidad_vendida),
        ingresos: parseFloat(row.ingresos)
      }))
    });
  } catch (error) {
    console.error('Error getting top products today:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving top products today', 
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// =====================================================
// RUTAS DE TESTING Y DIAGNÓSTICO
// =====================================================

// Health check para reportes
router.get('/health', async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'OK',
      message: 'Endpoints de reportes funcionando correctamente',
      timestamp: new Date().toISOString(),
      endpoints: {
        ventas: '/api/reportes/ventas',
        productos_populares: '/api/reportes/productos-populares',
        mesas: '/api/reportes/mesas',
        dashboard: '/api/reportes/dashboard',
        exportar: '/api/reportes/exportar',
        tendencias: '/api/reportes/tendencias',
        resumen_hoy: '/api/reportes/resumen-hoy',
        top_productos_hoy: '/api/reportes/top-productos-hoy'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'ERROR',
      message: 'Error en endpoints de reportes',
      error: error.message
    });
  }
});

// Test de datos para debugging
router.get('/test-data', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🧪 Ejecutando test de datos para reportes...');
    
    const tests = [
      {
        name: 'Órdenes totales',
        query: 'SELECT COUNT(*) as count FROM ordenes'
      },
      {
        name: 'Órdenes entregadas',
        query: "SELECT COUNT(*) as count FROM ordenes WHERE estado = 'entregada'"
      },
      {
        name: 'Items del menú',
        query: 'SELECT COUNT(*) as count FROM menu_items'
      },
      {
        name: 'Órdenes con items',
        query: `SELECT COUNT(DISTINCT o.id) as count FROM ordenes o 
                JOIN orden_items oi ON o.id = oi.orden_id`
      },
      {
        name: 'Estructura ejemplo',
        query: `SELECT o.id, o.mesa, o.total, o.fecha_creacion, 
                       oi.cantidad, oi.precio_unitario, 
                       m.nombre as producto
                FROM ordenes o
                JOIN orden_items oi ON o.id = oi.orden_id
                JOIN menu_items m ON oi.menu_item_id = m.id
                WHERE o.estado = 'entregada'
                LIMIT 3`
      }
    ];
    
    const results = {};
    
    for (const test of tests) {
      try {
        const result = await client.query(test.query);
        results[test.name] = {
          success: true,
          data: result.rows
        };
      } catch (error) {
        results[test.name] = {
          success: false,
          error: error.message
        };
      }
    }
    
    res.json({
      success: true,
      message: 'Test de datos completado',
      timestamp: new Date().toISOString(),
      results
    });
  } catch (error) {
    console.error('❌ Error en test de datos:', error);
    res.status(500).json({
      success: false,
      message: 'Error ejecutando test de datos',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// =====================================================
// MIDDLEWARE DE MANEJO DE ERRORES
// =====================================================

router.use((error, req, res, next) => {
  console.error('❌ Error en rutas de reportes:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Error de validación',
      errors: error.errors
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Error interno en reportes',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
  });
});

module.exports = router;backend/src/routes/reports.js - Rutas completas para reportes
const express = require('express');
const { body, query } = require('express-validator');
const ReportController = require('../controllers/ReportController');
const { authMiddleware, adminMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// Validaciones comunes
const validateDateRange = [
  query('fecha_inicio').optional().isDate().withMessage('Fecha de inicio debe ser válida'),
  query('fecha_fin').optional().isDate().withMessage('Fecha de fin debe ser válida'),
];

const validateReportFilters = [
  ...validateDateRange,
  query('mesa').optional().isString().withMessage('Mesa debe ser string'),
  query('producto').optional().isString().withMessage('Producto debe ser string'),
  query('categoria').optional().isString().withMessage('Categoría debe ser string'),
  query('limit').optional().isInt({ min: 1, max: 10000 }).withMessage('Limit debe ser entre 1 y 10000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset debe ser >= 0'),
];

// 📊 RUTAS PRINCIPALES DE REPORTES

// Reporte de ventas (acceso: admin, mesero)
router.get('/ventas', 
  authMiddleware, 
  roleMiddleware(['admin', 'mesero']),
  validateReportFilters,
  ReportController.getSalesReport
);

// Productos más populares (acceso: admin, mesero, chef)
router.get('/productos-populares', 
  authMiddleware,
  roleMiddleware(['admin', 'mesero', 'chef']),
  [
    ...validateDateRange,
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit debe ser entre 1 y 100')
  ],
  ReportController.getPopularProducts
);

// Reporte por mesas (acceso: admin, mesero)
router.get('/mesas',
  authMiddleware,
  roleMiddleware(['admin', 'mesero']),
  validateDateRange,
  ReportController.getTableReport
);

// Estadísticas del dashboard (acceso: admin)
router.get('/dashboard',
  authMiddleware,
  adminMiddleware,
  ReportController.getDashboardStats
);

// Ventas por período (acceso: admin, mesero)
router.get('/ventas-periodo',
  authMiddleware,
  roleMiddleware(['admin', 'mesero']),
  [
    query('periodo').optional().isIn(['hora', 'dia', 'semana', 'mes']).withMessage('Período debe ser: hora, dia, semana, mes')
  ],
  ReportController.getSalesByPeriod
);

// 📤 RUTAS DE EXPORTACIÓN

// Exportar datos (acceso: admin)
router.get('/exportar',
  authMiddleware,
  adminMiddleware,
  [
    query('tipo').optional().isIn(['ventas', 'productos', 'mesas']).withMessage('Tipo debe ser: ventas, productos, mesas'),
    query('formato').optional().isIn(['json', 'csv']).withMessage('Formato debe ser: json, csv'),
    ...validateReportFilters
  ],
  ReportController.exportData
);

// 📈 RUTAS ADICIONALES DE ANÁLISIS

// Análisis de tendencias (acceso: admin)
router.get('/tendencias',
  authMiddleware,
  adminMiddleware,
  validateDateRange,
  async (req, res) => {
    try {
      // Implementar análisis de tendencias
      res.json({
        success: true,
        message: 'Análisis de tendencias - próximamente',
        data: []
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error en análisis de tendencias',
        error: error.message
      });
    }
  }
);

// Comparación de períodos (acceso: admin)
router.get('/comparacion',
  authMiddleware,
  adminMiddleware,
  [
    query('periodo1_inicio').isDate().withMessage('Período 1 inicio requerido'),
    query('periodo1_fin').isDate().withMessage('Período 1 fin requerido'),
    query('periodo2_inicio').isDate().withMessage('Período 2 inicio requerido'),
    query('periodo2_fin').isDate().withMessage('Período 2 fin requerido'),
  ],
  async (req, res) => {
    try {
      // Implementar comparación de períodos
      res.json({
        success: true,
        message: 'Comparación de períodos - próximamente',
        data: {}
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error en comparación de períodos',
        error: error.message
      });
    }
  }
);

// 
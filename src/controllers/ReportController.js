// src/controllers/ReportController.js - Controlador completo para informes
const { Pool } = require('pg');
const config = require('../config/database');

const pool = new Pool(config);

class ReportController {
  
  // 📊 Obtener reporte de ventas con filtros avanzados
  async getSalesReport(req, res) {
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
      
      console.log('📊 Generando reporte de ventas con filtros:', req.query);
      
      // Query principal que simula la estructura que espera el frontend
      let query = `
        SELECT 
          o.id as orden_id,
          o.mesa,
          o.total,
          o.estado,
          o.fecha_creacion as fecha,
          o.metodo_pago,
          o.usuario_id,
          u.nombre as cliente_nombre,
          
          -- Datos del item para compatibilidad con frontend
          oi.cantidad,
          oi.precio_unitario as precio,
          m.nombre as nombre,
          c.nombre as categoria,
          
          -- Datos adicionales
          (oi.cantidad * oi.precio_unitario) as subtotal_item
          
        FROM ordenes o
        JOIN orden_items oi ON o.id = oi.orden_id
        JOIN menu_items m ON oi.menu_item_id = m.id
        JOIN categorias c ON m.categoria_id = c.id
        JOIN usuarios u ON o.usuario_id = u.id
        WHERE o.estado = 'entregada'
      `;

      const params = [];
      let paramCount = 0;

      // Filtro por rango de fechas
      if (fecha_inicio && fecha_fin) {
        paramCount += 2;
        query += ` AND DATE(o.fecha_creacion) BETWEEN $${paramCount - 1} AND $${paramCount}`;
        params.push(fecha_inicio, fecha_fin);
      } else if (fecha_inicio) {
        paramCount++;
        query += ` AND DATE(o.fecha_creacion) >= $${paramCount}`;
        params.push(fecha_inicio);
      } else if (fecha_fin) {
        paramCount++;
        query += ` AND DATE(o.fecha_creacion) <= $${paramCount}`;
        params.push(fecha_fin);
      }

      // Filtro por mesa
      if (mesa && mesa !== '') {
        paramCount++;
        query += ` AND o.mesa = $${paramCount}`;
        params.push(mesa);
      }

      // Filtro por producto (nombre)
      if (producto && producto !== '') {
        paramCount++;
        query += ` AND LOWER(m.nombre) LIKE LOWER($${paramCount})`;
        params.push(`%${producto}%`);
      }

      // Filtro por categoría
      if (categoria && categoria !== '') {
        paramCount++;
        query += ` AND LOWER(c.nombre) = LOWER($${paramCount})`;
        params.push(categoria);
      }

      query += ' ORDER BY o.fecha_creacion DESC';

      // Agregar paginación
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

      console.log('🔍 Query ejecutada:', query);
      console.log('📝 Parámetros:', params);

      const result = await client.query(query, params);
      
      // Procesar datos para que coincidan con la estructura esperada por el frontend
      const ventas = result.rows.map(row => ({
        id: `${row.orden_id}-${row.nombre}`, // ID único para el frontend
        mesa: row.mesa,
        fecha: row.fecha,
        total: parseFloat(row.total),
        items: [{
          nombre: row.nombre,
          cantidad: parseInt(row.cantidad),
          precio: parseFloat(row.precio),
          categoria: row.categoria
        }],
        // Datos adicionales para compatibilidad
        estado: row.estado,
        metodo_pago: row.metodo_pago,
        cliente_nombre: row.cliente_nombre
      }));

      // Agrupar por orden para evitar duplicados
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
          nombre: row.nombre,
          cantidad: parseInt(row.cantidad),
          precio: parseFloat(row.precio),
          categoria: row.categoria
        });
      });

      const ventasFinales = Object.values(ventasAgrupadas);
      
      // Calcular estadísticas
      const totalVentas = ventasFinales.reduce((sum, venta) => sum + venta.total, 0);
      const totalItems = result.rows.reduce((sum, row) => sum + parseInt(row.cantidad), 0);
      const numeroOrdenes = ventasFinales.length;

      console.log(`✅ Reporte generado: ${numeroOrdenes} órdenes, ${totalItems} items, $${totalVentas} total`);
      
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
      console.error('❌ Error generando reporte de ventas:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error generando reporte de ventas', 
        error: error.message 
      });
    } finally {
      client.release();
    }
  }

  // 🏆 Productos más populares
  async getPopularProducts(req, res) {
    const client = await pool.connect();
    try {
      const { 
        fecha_inicio, 
        fecha_fin, 
        limit = 10 
      } = req.query;
      
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
      
      console.log(`🏆 Productos populares: ${result.rows.length} productos`);
      
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
      console.error('❌ Error obteniendo productos populares:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error obteniendo productos populares', 
        error: error.message 
      });
    } finally {
      client.release();
    }
  }

  // 🪑 Reporte por mesas
  async getTableReport(req, res) {
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
      
      console.log(`🪑 Reporte de mesas: ${result.rows.length} mesas`);
      
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
      console.error('❌ Error generando reporte de mesas:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error generando reporte de mesas', 
        error: error.message 
      });
    } finally {
      client.release();
    }
  }

  // 📈 Dashboard estadísticas
  async getDashboardStats(req, res) {
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
         WHERE estado = 'entregada' AND DATE(fecha_creacion) = $1`
      ];

      const results = await Promise.all(
        queries.map(query => client.query(query, [today, startOfMonth]))
      );

      console.log('📈 Estadísticas del dashboard generadas');

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
            producto_mas_vendido: results[5].rows[0] || null
          },
          fecha_generacion: new Date().toISOString(),
          periodo: {
            hoy: today,
            inicio_mes: startOfMonth
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas del dashboard:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error obteniendo estadísticas del dashboard', 
        error: error.message 
      });
    } finally {
      client.release();
    }
  }

  // 📅 Ventas por período específico
  async getSalesByPeriod(req, res) {
    const client = await pool.connect();
    try {
      const { periodo = 'dia' } = req.query; // dia, semana, mes, año
      
      let groupBy, dateFormat;
      switch (periodo) {
        case 'hora':
          groupBy = "DATE_TRUNC('hour', fecha_creacion)";
          dateFormat = 'HH24:00';
          break;
        case 'dia':
          groupBy = "DATE(fecha_creacion)";
          dateFormat = 'DD/MM/YYYY';
          break;
        case 'semana':
          groupBy = "DATE_TRUNC('week', fecha_creacion)";
          dateFormat = 'DD/MM/YYYY';
          break;
        case 'mes':
          groupBy = "DATE_TRUNC('month', fecha_creacion)";
          dateFormat = 'MM/YYYY';
          break;
        default:
          groupBy = "DATE(fecha_creacion)";
          dateFormat = 'DD/MM/YYYY';
      }

      const query = `
        SELECT 
          ${groupBy} as periodo,
          TO_CHAR(${groupBy}, '${dateFormat}') as periodo_formato,
          COUNT(*) as total_ordenes,
          SUM(total) as ingresos_totales,
          AVG(total) as promedio_orden
        FROM ordenes
        WHERE estado = 'entregada'
          AND fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY ${groupBy}
        ORDER BY periodo DESC
        LIMIT 30
      `;

      const result = await client.query(query);
      
      console.log(`📅 Ventas por ${periodo}: ${result.rows.length} períodos`);
      
      res.json({
        success: true,
        periodo,
        datos: result.rows.map(row => ({
          periodo: row.periodo,
          periodo_formato: row.periodo_formato,
          total_ordenes: parseInt(row.total_ordenes),
          ingresos_totales: parseFloat(row.ingresos_totales),
          promedio_orden: parseFloat(row.promedio_orden)
        }))
      });
      
    } catch (error) {
      console.error('❌ Error obteniendo ventas por período:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error obteniendo ventas por período', 
        error: error.message 
      });
    } finally {
      client.release();
    }
  }

  // 📊 Exportar datos (CSV/JSON)
  async exportData(req, res) {
    try {
      const { formato = 'json', tipo = 'ventas' } = req.query;
      
      let data;
      switch (tipo) {
        case 'ventas':
          // Reutilizar el método de ventas pero sin límites
          req.query.limit = 10000;
          const mockRes = {
            json: (responseData) => { data = responseData; }
          };
          await this.getSalesReport(req, mockRes);
          break;
        default:
          return res.status(400).json({ 
            success: false, 
            message: 'Tipo de exportación no válido' 
          });
      }

      if (formato === 'csv') {
        // Convertir a CSV
        const csv = this.convertToCSV(data.ventas);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${tipo}_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
      } else {
        // JSON por defecto
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${tipo}_${new Date().toISOString().split('T')[0]}.json"`);
        res.json(data);
      }
      
    } catch (error) {
      console.error('❌ Error exportando datos:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error exportando datos', 
        error: error.message 
      });
    }
  }

  // Método auxiliar para convertir a CSV
  convertToCSV(ventas) {
    const headers = ['Mesa', 'Fecha', 'Producto', 'Cantidad', 'Precio', 'Subtotal', 'Total Orden'];
    const rows = [];
    
    ventas.forEach(venta => {
      venta.items.forEach(item => {
        rows.push([
          venta.mesa,
          new Date(venta.fecha).toLocaleDateString(),
          item.nombre,
          item.cantidad,
          item.precio,
          item.cantidad * item.precio,
          venta.total
        ]);
      });
    });
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
      
    return csvContent;
  }
}

module.exports = new ReportController();
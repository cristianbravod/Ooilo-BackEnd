// backend/src/models/OrderModel.js
const { Pool } = require('pg');
const config = require('../config/database');

class OrderModel {
  constructor() {
    this.pool = new Pool(config);
  }

  // Crear nueva orden
  async createOrder(orderData) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const {
        usuario_id,
        mesa,
        total,
        tipo_orden,
        direccion_entrega,
        metodo_pago,
        notas,
        estado,
        items
      } = orderData;

      // Crear la orden
      const orderQuery = `
        INSERT INTO ordenes (
          usuario_id, mesa, total, tipo_orden, direccion_entrega, 
          metodo_pago, notas, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const orderResult = await client.query(orderQuery, [
        usuario_id,
        mesa,
        total,
        tipo_orden || 'mesa',
        direccion_entrega,
        metodo_pago,
        notas,
        estado || 'pendiente'
      ]);

      const order = orderResult.rows[0];

      // Crear los items de la orden
      const itemsData = [];
      for (const item of items) {
        const itemQuery = `
          INSERT INTO orden_items (
            orden_id, menu_item_id, cantidad, precio_unitario, instrucciones_especiales
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;

        const itemResult = await client.query(itemQuery, [
          order.id,
          item.menu_item_id,
          item.cantidad,
          item.precio_unitario,
          item.instrucciones_especiales
        ]);

        itemsData.push(itemResult.rows[0]);
      }

      await client.query('COMMIT');

      // Retornar orden completa con items
      return {
        ...order,
        items: itemsData
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Obtener orden por ID con items
  async getOrderById(id) {
    const orderQuery = `
      SELECT o.*, u.nombre as usuario_nombre, u.telefono as usuario_telefono
      FROM ordenes o
      JOIN usuarios u ON o.usuario_id = u.id
      WHERE o.id = $1
    `;

    const itemsQuery = `
      SELECT oi.*, m.nombre as menu_item_nombre, m.imagen as menu_item_imagen
      FROM orden_items oi
      JOIN menu_items m ON oi.menu_item_id = m.id
      WHERE oi.orden_id = $1
    `;

    const [orderResult, itemsResult] = await Promise.all([
      this.pool.query(orderQuery, [id]),
      this.pool.query(itemsQuery, [id])
    ]);

    if (orderResult.rows.length === 0) {
      return null;
    }

    return {
      ...orderResult.rows[0],
      items: itemsResult.rows
    };
  }

  // Obtener órdenes por usuario
  async getOrdersByUser(usuario_id, limit = 20, offset = 0) {
    const ordersQuery = `
      SELECT * FROM ordenes 
      WHERE usuario_id = $1 
      ORDER BY fecha_creacion DESC 
      LIMIT $2 OFFSET $3
    `;

    const ordersResult = await this.pool.query(ordersQuery, [usuario_id, limit, offset]);
    const orders = [];

    // Obtener items para cada orden
    for (const order of ordersResult.rows) {
      const itemsQuery = `
        SELECT oi.*, m.nombre as menu_item_nombre, m.imagen as menu_item_imagen
        FROM orden_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.orden_id = $1
      `;

      const itemsResult = await this.pool.query(itemsQuery, [order.id]);
      orders.push({
        ...order,
        items: itemsResult.rows
      });
    }

    return orders;
  }

  // Obtener todas las órdenes con filtros (Admin)
  async getAllOrders(filters = {}) {
    let query = `
      SELECT o.*, u.nombre as usuario_nombre, u.telefono as usuario_telefono, u.email as usuario_email
      FROM ordenes o
      JOIN usuarios u ON o.usuario_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (filters.estado) {
      paramCount++;
      query += ` AND o.estado = $${paramCount}`;
      params.push(filters.estado);
    }

    if (filters.fecha) {
      paramCount++;
      query += ` AND DATE(o.fecha_creacion) = $${paramCount}`;
      params.push(filters.fecha);
    }

    if (filters.mesa) {
      paramCount++;
      query += ` AND o.mesa = $${paramCount}`;
      params.push(filters.mesa);
    }

    query += ' ORDER BY o.fecha_creacion DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(filters.offset);
    }

    const ordersResult = await this.pool.query(query, params);
    const orders = [];

    // Obtener items para cada orden
    for (const order of ordersResult.rows) {
      const itemsQuery = `
        SELECT oi.*, m.nombre as menu_item_nombre, m.imagen as menu_item_imagen
        FROM orden_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.orden_id = $1
      `;

      const itemsResult = await this.pool.query(itemsQuery, [order.id]);
      orders.push({
        ...order,
        items: itemsResult.rows
      });
    }

    return orders;
  }

  // Actualizar estado de orden
  async updateOrderStatus(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 0;

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    // Agregar fecha de modificación
    paramCount++;
    fields.push(`fecha_modificacion = $${paramCount}`);
    values.push(new Date());

    // Agregar ID
    paramCount++;
    values.push(id);

    const query = `
      UPDATE ordenes 
      SET ${fields.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  // Obtener órdenes por mesa
  async getOrdersByTable(mesa, estado = null) {
    let query = `
      SELECT o.*, u.nombre as usuario_nombre
      FROM ordenes o
      JOIN usuarios u ON o.usuario_id = u.id
      WHERE o.mesa = $1
    `;

    const params = [mesa];
    let paramCount = 1;

    if (estado) {
      paramCount++;
      query += ` AND o.estado = $${paramCount}`;
      params.push(estado);
    }

    query += ' ORDER BY o.fecha_creacion DESC';

    const ordersResult = await this.pool.query(query, params);
    const orders = [];

    for (const order of ordersResult.rows) {
      const itemsQuery = `
        SELECT oi.*, m.nombre as menu_item_nombre
        FROM orden_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.orden_id = $1
      `;

      const itemsResult = await this.pool.query(itemsQuery, [order.id]);
      orders.push({
        ...order,
        items: itemsResult.rows
      });
    }

    return orders;
  }

  // Obtener órdenes activas (para cocina)
  async getActiveOrders() {
    const query = `
      SELECT o.*, u.nombre as usuario_nombre
      FROM ordenes o
      JOIN usuarios u ON o.usuario_id = u.id
      WHERE o.estado IN ('pendiente', 'confirmada', 'preparando')
      ORDER BY o.fecha_creacion ASC
    `;

    const ordersResult = await this.pool.query(query);
    const orders = [];

    for (const order of ordersResult.rows) {
      const itemsQuery = `
        SELECT oi.*, m.nombre as menu_item_nombre, m.tiempo_preparacion
        FROM orden_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.orden_id = $1
      `;

      const itemsResult = await this.pool.query(itemsQuery, [order.id]);
      orders.push({
        ...order,
        items: itemsResult.rows
      });
    }

    return orders;
  }

  // Obtener estadísticas de órdenes
  async getOrderStats(fechaInicio, fechaFin) {
    const queries = [
      // Total de órdenes
      `SELECT COUNT(*) as total_ordenes FROM ordenes 
       WHERE DATE(fecha_creacion) BETWEEN $1 AND $2`,
      
      // Ingresos totales
      `SELECT SUM(total) as ingresos_totales FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) BETWEEN $1 AND $2`,
      
      // Órdenes por estado
      `SELECT estado, COUNT(*) as cantidad FROM ordenes 
       WHERE DATE(fecha_creacion) BETWEEN $1 AND $2 
       GROUP BY estado`,
      
      // Promedio de orden
      `SELECT AVG(total) as promedio_orden FROM ordenes 
       WHERE estado = 'entregada' AND DATE(fecha_creacion) BETWEEN $1 AND $2`,
      
      // Items más vendidos
      `SELECT m.nombre, SUM(oi.cantidad) as total_vendido
       FROM orden_items oi
       JOIN menu_items m ON oi.menu_item_id = m.id
       JOIN ordenes o ON oi.orden_id = o.id
       WHERE o.estado = 'entregada' AND DATE(o.fecha_creacion) BETWEEN $1 AND $2
       GROUP BY m.id, m.nombre
       ORDER BY total_vendido DESC
       LIMIT 5`
    ];

    const results = await Promise.all(
      queries.map(query => this.pool.query(query, [fechaInicio, fechaFin]))
    );

    return {
      total_ordenes: parseInt(results[0].rows[0].total_ordenes),
      ingresos_totales: parseFloat(results[1].rows[0].ingresos_totales) || 0,
      ordenes_por_estado: results[2].rows,
      promedio_orden: parseFloat(results[3].rows[0].promedio_orden) || 0,
      items_mas_vendidos: results[4].rows
    };
  }

  // Cerrar mesa (marcar órdenes como entregadas)
  async closeTable(mesa, metodoPago) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Obtener órdenes activas de la mesa
      const activeOrdersQuery = `
        SELECT * FROM ordenes 
        WHERE mesa = $1 AND estado IN ('pendiente', 'confirmada', 'preparando', 'lista')
      `;
      const activeOrders = await client.query(activeOrdersQuery, [mesa]);

      if (activeOrders.rows.length === 0) {
        await client.query('ROLLBACK');
        return [];
      }

      // Actualizar órdenes a entregada
      const updateQuery = `
        UPDATE ordenes 
        SET estado = 'entregada', metodo_pago = $2, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE mesa = $1 AND estado IN ('pendiente', 'confirmada', 'preparando', 'lista')
        RETURNING *
      `;

      const updatedOrders = await client.query(updateQuery, [mesa, metodoPago]);

      await client.query('COMMIT');
      return updatedOrders.rows;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Crear usuario temporal para mesa
  async createTempUser(mesa) {
    const query = `
      INSERT INTO usuarios (nombre, email, password, telefono, rol) 
      VALUES ($1, $2, $3, $4, 'cliente')
      RETURNING id
    `;

    const tempEmail = `mesa${mesa}@temp.local`;
    const tempPassword = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // temp123

    const result = await this.pool.query(query, [
      `Mesa ${mesa}`,
      tempEmail,
      tempPassword,
      '000000000'
    ]);

    return result.rows[0].id;
  }

  // Cerrar conexión
  async closeConnection() {
    await this.pool.end();
  }
}

module.exports = new OrderModel();
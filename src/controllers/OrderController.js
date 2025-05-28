// src/controllers/OrderController.js - Versión simplificada que funciona
const { Pool } = require('pg');
const config = require('../config/database');

const pool = new Pool(config);

class OrderController {
  // Crear orden rápida (sin autenticación)
  async createQuickOrder(req, res) {
    try {
      const { mesa, items } = req.body;
      
      // Calcular total
      let total = 0;
      const client = await pool.connect();
      
      try {
        for (const item of items) {
          const menuResult = await client.query('SELECT precio FROM menu_items WHERE id = $1', [item.menu_item_id]);
          if (menuResult.rows.length === 0) {
            return res.status(400).json({ message: `Menu item ${item.menu_item_id} not found` });
          }
          total += menuResult.rows[0].precio * item.cantidad;
        }

        // Crear orden simple
        const orderResult = await client.query(
          'INSERT INTO ordenes (usuario_id, mesa, total, estado, metodo_pago) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [1, mesa, total, 'pendiente', 'efectivo'] // Usuario genérico ID 1
        );

        const order = orderResult.rows[0];

        // Crear items de orden
        for (const item of items) {
          const menuResult = await client.query('SELECT precio FROM menu_items WHERE id = $1', [item.menu_item_id]);
          await client.query(
            'INSERT INTO orden_items (orden_id, menu_item_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)',
            [order.id, item.menu_item_id, item.cantidad, menuResult.rows[0].precio]
          );
        }

        res.status(201).json(order);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error creating quick order:', error);
      res.status(500).json({ message: 'Error creating quick order', error: error.message });
    }
  }

  // Obtener órdenes por mesa
  async getOrdersByTable(req, res) {
    try {
      const { mesa } = req.params;
      const result = await pool.query(
        'SELECT * FROM ordenes WHERE mesa = $1 ORDER BY fecha_creacion DESC',
        [mesa]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error getting orders by table:', error);
      res.status(500).json({ message: 'Error retrieving orders', error: error.message });
    }
  }

  // Cerrar mesa
  async closeTable(req, res) {
    try {
      const { mesa } = req.params;
      const { metodo_pago } = req.body;

      const result = await pool.query(
        'UPDATE ordenes SET estado = $1, metodo_pago = $2 WHERE mesa = $3 AND estado != $4 RETURNING *',
        ['entregada', metodo_pago, mesa, 'entregada']
      );

      const total = result.rows.reduce((sum, order) => sum + parseFloat(order.total), 0);

      res.json({
        message: 'Table closed successfully',
        orders: result.rows,
        total
      });
    } catch (error) {
      console.error('Error closing table:', error);
      res.status(500).json({ message: 'Error closing table', error: error.message });
    }
  }

  // Métodos básicos para autenticación (simplificados)
  async createOrder(req, res) {
    res.status(501).json({ message: 'Full order creation not implemented yet' });
  }

  async getMyOrders(req, res) {
    res.status(501).json({ message: 'User orders not implemented yet' });
  }

  async getOrderById(req, res) {
    res.status(501).json({ message: 'Get order by ID not implemented yet' });
  }

  async cancelOrder(req, res) {
    res.status(501).json({ message: 'Cancel order not implemented yet' });
  }

  async getAllOrders(req, res) {
    res.status(501).json({ message: 'Get all orders not implemented yet' });
  }

  async getActiveOrders(req, res) {
    res.status(501).json({ message: 'Get active orders not implemented yet' });
  }

  async updateOrderStatus(req, res) {
    res.status(501).json({ message: 'Update order status not implemented yet' });
  }

  async getOrderStats(req, res) {
    res.status(501).json({ message: 'Order stats not implemented yet' });
  }
}

module.exports = new OrderController();
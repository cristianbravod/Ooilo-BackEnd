// src/controllers/MenuController.js - Versión simplificada
const { Pool } = require('pg');
const config = require('../config/database');

const pool = new Pool(config);

class MenuController {
  // Obtener categorías
  async getCategories(req, res) {
    try {
      const result = await pool.query('SELECT * FROM categorias WHERE activo = true ORDER BY nombre');
      res.json(result.rows);
    } catch (error) {
      console.error('Error getting categories:', error);
      res.status(500).json({ message: 'Error retrieving categories', error: error.message });
    }
  }

  // Obtener menú
  async getMenu(req, res) {
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

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error('Error getting menu:', error);
      res.status(500).json({ message: 'Error retrieving menu', error: error.message });
    }
  }

  // Obtener item del menú
  async getMenuItem(req, res) {
    try {
      const result = await pool.query(
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
      console.error('Error getting menu item:', error);
      res.status(500).json({ message: 'Error retrieving menu item', error: error.message });
    }
  }

  // Obtener platos especiales
  async getSpecialItems(req, res) {
    try {
      let query = `
        SELECT m.*, c.nombre as categoria_nombre 
        FROM menu_items m 
        JOIN categorias c ON m.categoria_id = c.id 
        WHERE m.disponible = true
      `;
      
      // Si existe la columna es_especial, úsala; si no, usar lógica alternativa
      try {
        await pool.query('SELECT es_especial FROM menu_items LIMIT 1');
        query += ' AND m.es_especial = true';
      } catch (e) {
        // Columna no existe, usar precio alto como criterio
        query += ` AND m.precio > (SELECT AVG(precio) * 1.5 FROM menu_items)`;
      }

      query += ' ORDER BY m.fecha_creacion DESC';

      const result = await pool.query(query);
      res.json(result.rows);
    } catch (error) {
      console.error('Error getting special items:', error);
      res.status(500).json({ message: 'Error retrieving special items', error: error.message });
    }
  }

  // Métodos de admin (simplificados por ahora)
  async createCategory(req, res) {
    res.status(501).json({ message: 'Create category not implemented yet' });
  }

  async createMenuItem(req, res) {
    res.status(501).json({ message: 'Create menu item not implemented yet' });
  }

  async updateMenuItem(req, res) {
    res.status(501).json({ message: 'Update menu item not implemented yet' });
  }

  async deleteMenuItem(req, res) {
    res.status(501).json({ message: 'Delete menu item not implemented yet' });
  }

  async toggleAvailability(req, res) {
    res.status(501).json({ message: 'Toggle availability not implemented yet' });
  }

  async createSpecialItem(req, res) {
    res.status(501).json({ message: 'Create special item not implemented yet' });
  }
}

module.exports = new MenuController();
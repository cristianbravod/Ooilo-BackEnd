// backend/src/models/MenuModel.js
const { Pool } = require('pg');
const config = require('../config/database');

class MenuModel {
  constructor() {
    this.pool = new Pool(config);
  }

  // Obtener todas las categorías activas
  async getAllCategories() {
    const query = 'SELECT * FROM categorias WHERE activo = true ORDER BY nombre';
    const result = await this.pool.query(query);
    return result.rows;
  }

  // Obtener categoría por ID
  async getCategoryById(id) {
    const query = 'SELECT * FROM categorias WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0];
  }

  // Crear nueva categoría
  async createCategory(categoryData) {
    const { nombre, descripcion, imagen } = categoryData;
    const query = `
      INSERT INTO categorias (nombre, descripcion, imagen) 
      VALUES ($1, $2, $3) 
      RETURNING *
    `;
    const result = await this.pool.query(query, [nombre, descripcion, imagen]);
    return result.rows[0];
  }

  // Obtener menú con filtros
  async getMenuWithFilters(filters) {
    let query = `
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE c.activo = true
    `;
    const params = [];
    let paramCount = 0;

    if (filters.disponible !== undefined) {
      paramCount++;
      query += ` AND m.disponible = $${paramCount}`;
      params.push(filters.disponible);
    }

    if (filters.categoria_id) {
      paramCount++;
      query += ` AND m.categoria_id = $${paramCount}`;
      params.push(filters.categoria_id);
    }

    if (filters.vegetariano) {
      query += ` AND m.vegetariano = true`;
    }

    if (filters.picante) {
      query += ` AND m.picante = true`;
    }

    query += ' ORDER BY c.nombre, m.nombre';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // Obtener item del menú por ID
  async getMenuItemById(id) {
    const query = `
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.id = $1
    `;
    const result = await this.pool.query(query, [id]);
    return result.rows[0];
  }

  // Crear nuevo item del menú
  async createMenuItem(itemData) {
    const {
      nombre,
      descripcion,
      precio,
      categoria_id,
      imagen,
      ingredientes,
      vegetariano,
      picante,
      tiempo_preparacion,
      es_especial
    } = itemData;

    const query = `
      INSERT INTO menu_items (
        nombre, descripcion, precio, categoria_id, imagen, ingredientes,
        vegetariano, picante, tiempo_preparacion, es_especial
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      nombre,
      descripcion,
      precio,
      categoria_id,
      imagen,
      ingredientes || [],
      vegetariano || false,
      picante || false,
      tiempo_preparacion,
      es_especial || false
    ]);

    return result.rows[0];
  }

  // Actualizar item del menú
  async updateMenuItem(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 0;

    // Construir query dinámicamente basado en los campos a actualizar
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

    // Agregar ID como último parámetro
    paramCount++;
    values.push(id);

    const query = `
      UPDATE menu_items 
      SET ${fields.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  // Eliminar item del menú (soft delete)
  async deleteMenuItem(id) {
    const query = `
      UPDATE menu_items 
      SET disponible = false, fecha_modificacion = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *
    `;
    const result = await this.pool.query(query, [id]);
    return result.rows[0];
  }

  // Obtener platos especiales
  async getSpecialItems(disponible = true) {
    let query = `
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.es_especial = true
    `;

    const params = [];
    if (disponible !== undefined) {
      query += ' AND m.disponible = $1';
      params.push(disponible);
    }

    query += ' ORDER BY m.fecha_creacion DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // Obtener ID de categoría especial
  async getSpecialCategoryId() {
    const query = `
      SELECT id FROM categorias 
      WHERE nombre = 'Platos Especiales' AND activo = true
    `;
    const result = await this.pool.query(query);
    return result.rows[0]?.id;
  }

  // Obtener items más vendidos
  async getBestSellingItems(limit = 10, dateRange = null) {
    let query = `
      SELECT 
        m.id,
        m.nombre,
        m.precio,
        c.nombre as categoria_nombre,
        SUM(oi.cantidad) as total_vendido,
        SUM(oi.cantidad * oi.precio_unitario) as ingresos_totales
      FROM menu_items m
      JOIN categorias c ON m.categoria_id = c.id
      JOIN orden_items oi ON m.id = oi.menu_item_id
      JOIN ordenes o ON oi.orden_id = o.id
      WHERE o.estado = 'entregada'
    `;

    const params = [];
    let paramCount = 0;

    if (dateRange && dateRange.inicio && dateRange.fin) {
      paramCount += 2;
      query += ` AND o.fecha_creacion BETWEEN $${paramCount - 1} AND $${paramCount}`;
      params.push(dateRange.inicio, dateRange.fin);
    }

    query += `
      GROUP BY m.id, m.nombre, m.precio, c.nombre
      ORDER BY total_vendido DESC
      LIMIT $${paramCount + 1}
    `;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // Obtener estadísticas del menú
  async getMenuStats() {
    const queries = [
      'SELECT COUNT(*) as total_items FROM menu_items WHERE disponible = true',
      'SELECT COUNT(*) as total_categories FROM categorias WHERE activo = true',
      'SELECT COUNT(*) as special_items FROM menu_items WHERE es_especial = true AND disponible = true',
      'SELECT AVG(precio) as precio_promedio FROM menu_items WHERE disponible = true'
    ];

    const results = await Promise.all(
      queries.map(query => this.pool.query(query))
    );

    return {
      total_items: parseInt(results[0].rows[0].total_items),
      total_categories: parseInt(results[1].rows[0].total_categories),
      special_items: parseInt(results[2].rows[0].special_items),
      precio_promedio: parseFloat(results[3].rows[0].precio_promedio) || 0
    };
  }

  // Buscar items del menú
  async searchMenuItems(searchTerm, filters = {}) {
    let query = `
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.disponible = true 
      AND c.activo = true
      AND (
        LOWER(m.nombre) LIKE LOWER($1) 
        OR LOWER(m.descripcion) LIKE LOWER($1)
        OR $1 = ANY(SELECT LOWER(unnest(m.ingredientes)))
      )
    `;

    const params = [`%${searchTerm}%`];
    let paramCount = 1;

    if (filters.categoria_id) {
      paramCount++;
      query += ` AND m.categoria_id = $${paramCount}`;
      params.push(filters.categoria_id);
    }

    if (filters.vegetariano) {
      query += ` AND m.vegetariano = true`;
    }

    if (filters.precio_max) {
      paramCount++;
      query += ` AND m.precio <= $${paramCount}`;
      params.push(filters.precio_max);
    }

    query += ' ORDER BY m.nombre';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // Cerrar conexión
  async closeConnection() {
    await this.pool.end();
  }
}

module.exports = new MenuModel();
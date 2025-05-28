-- database/init.sql - Script de inicialización simplificado para Windows
-- Crear extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Eliminar tablas si existen (para desarrollo)
DROP TABLE IF EXISTS orden_items CASCADE;
DROP TABLE IF EXISTS ordenes CASCADE;
DROP TABLE IF EXISTS reservaciones CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS mesas CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- Tabla de usuarios
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    direccion TEXT,
    rol VARCHAR(20) DEFAULT 'cliente' CHECK (rol IN ('cliente', 'admin')),
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de categorías
CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    imagen VARCHAR(255),
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de items del menú
CREATE TABLE menu_items (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    categoria_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
    imagen VARCHAR(255),
    ingredientes TEXT[],
    disponible BOOLEAN DEFAULT true,
    vegetariano BOOLEAN DEFAULT false,
    picante BOOLEAN DEFAULT false,
    tiempo_preparacion INTEGER,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de mesas
CREATE TABLE mesas (
    id SERIAL PRIMARY KEY,
    numero INTEGER UNIQUE NOT NULL,
    capacidad INTEGER NOT NULL,
    ubicacion VARCHAR(50),
    disponible BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de órdenes
CREATE TABLE ordenes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    total DECIMAL(10,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'preparando', 'lista', 'entregada', 'cancelada')),
    direccion_entrega TEXT,
    metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia')),
    notas TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de items de la orden
CREATE TABLE orden_items (
    id SERIAL PRIMARY KEY,
    orden_id INTEGER REFERENCES ordenes(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(10,2) NOT NULL,
    instrucciones_especiales TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de reservaciones
CREATE TABLE reservaciones (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    mesa_id INTEGER REFERENCES mesas(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    numero_personas INTEGER NOT NULL CHECK (numero_personas > 0),
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
    solicitudes_especiales TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar el performance
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_menu_items_categoria ON menu_items(categoria_id);
CREATE INDEX idx_ordenes_usuario ON ordenes(usuario_id);
CREATE INDEX idx_orden_items_orden ON orden_items(orden_id);

-- Insertar datos iniciales

-- Usuario administrador (password: admin123)
INSERT INTO usuarios (nombre, email, password, telefono, direccion, rol) VALUES 
('Administrador', 'admin@restaurant.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '+56912345678', 'Dirección del restaurante', 'admin');

-- Usuario cliente de prueba (password: cliente123)
INSERT INTO usuarios (nombre, email, password, telefono, direccion, rol) VALUES 
('Cliente Prueba', 'cliente@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '+56987654321', 'Las Condes, Santiago', 'cliente');

-- Categorías
INSERT INTO categorias (nombre, descripcion, imagen) VALUES 
('Entradas', 'Platos para comenzar la experiencia gastronómica', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400'),
('Platos Principales', 'Nuestros platos estrella y especialidades', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'),
('Postres', 'Dulces tentaciones para finalizar', 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400'),
('Bebidas', 'Bebidas refrescantes y calientes', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'),
('Pizzas', 'Pizzas artesanales con ingredientes frescos', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400');

-- Items del menú
INSERT INTO menu_items (nombre, descripcion, precio, categoria_id, imagen, ingredientes, vegetariano, picante, tiempo_preparacion) VALUES 

-- Entradas
('Empanadas de Pino', 'Tradicionales empanadas chilenas rellenas de carne, cebolla, huevo y aceitunas', 3500, 1, 'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=400', ARRAY['Carne molida', 'Cebolla', 'Huevo', 'Aceitunas'], false, false, 15),
('Palta Reina', 'Palta rellena con camarones, mayonesa y pimentón', 4200, 1, 'https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf?w=400', ARRAY['Palta', 'Camarones', 'Mayonesa'], false, false, 10),
('Tabla de Quesos', 'Selección de quesos artesanales con frutos secos', 6800, 1, 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400', ARRAY['Quesos variados', 'Nueces', 'Mermelada'], true, false, 5),

-- Platos Principales
('Lomo a lo Pobre', 'Lomo de res con papas fritas, huevo frito y palta', 8900, 2, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400', ARRAY['Lomo de res', 'Papas', 'Huevo', 'Palta'], false, false, 25),
('Salmón Grillado', 'Salmón fresco a la parrilla con verduras asadas', 9500, 2, 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400', ARRAY['Salmón', 'Verduras mixtas', 'Aceite de oliva'], false, false, 20),
('Pollo al Curry', 'Pechuga de pollo en salsa de curry con arroz', 7800, 2, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400', ARRAY['Pollo', 'Curry', 'Arroz'], false, true, 30),

-- Pizzas
('Pizza Margherita', 'Salsa de tomate, mozzarella fresca y albahaca', 7200, 5, 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=400', ARRAY['Salsa de tomate', 'Mozzarella', 'Albahaca'], true, false, 18),
('Pizza Pepperoni', 'Salsa de tomate, mozzarella y pepperoni premium', 8400, 5, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400', ARRAY['Salsa de tomate', 'Mozzarella', 'Pepperoni'], false, false, 18),

-- Postres
('Tiramisu', 'Clásico postre italiano con café y mascarpone', 4200, 3, 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400', ARRAY['Mascarpone', 'Café', 'Cacao'], true, false, 10),
('Cheesecake', 'Tarta de queso cremosa con frutos rojos', 3800, 3, 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400', ARRAY['Queso crema', 'Frutos rojos'], true, false, 8),

-- Bebidas
('Jugo de Naranja', 'Jugo de naranja recién exprimido', 2800, 4, 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400', ARRAY['Naranjas frescas'], true, false, 5),
('Café Americano', 'Café de grano premium', 2200, 4, 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=400', ARRAY['Café de grano'], true, false, 3),
('Limonada', 'Limonada fresca con menta', 2500, 4, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400', ARRAY['Limones', 'Menta'], true, false, 5);

-- Mesas
INSERT INTO mesas (numero, capacidad, ubicacion) VALUES 
(1, 2, 'interior'),
(2, 4, 'interior'),
(3, 4, 'interior'),
(4, 6, 'interior'),
(5, 2, 'terraza'),
(6, 4, 'terraza'),
(7, 6, 'terraza'),
(8, 4, 'privado');

-- Mensaje de confirmación
SELECT 'Base de datos configurada exitosamente para Windows!' as mensaje;
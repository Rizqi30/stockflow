INSERT INTO products (sku, name, price, stock) VALUES
('SKU-001', 'Beras Premium 5kg',   75000,  100),
('SKU-002', 'Minyak Goreng 2L',    32000,   80),
('SKU-003', 'Gula Pasir 1kg',      15000,  150),
('SKU-004', 'Tepung Terigu 1kg',   12000,  200),
('SKU-005', 'Kecap Manis 600ml',   18000,   60),
('SKU-006', 'Sambal Botol 275ml',  14000,   45),
('SKU-007', 'Mie Instan Box',      95000,  300),
('SKU-008', 'Kopi Sachet Box',     48000,  120),
('SKU-009', 'Teh Celup Box',       22000,   90),
('SKU-010', 'Susu UHT 1L',        17000,   75),
('SKU-011', 'Sabun Cuci 800g',     25000,  110),
('SKU-012', 'Air Mineral Box',     52000,  250)
ON CONFLICT (sku) DO NOTHING;

-- Sample Orders
INSERT INTO sales_orders (id, customer, status, total) VALUES
(1, 'Toko Barokah', 'CREATED', 171000),
(2, 'Warung Makmur', 'CREATED', 159000);

-- Sample Order Items
INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES
(1, 'SKU-001', 1, 75000),
(1, 'SKU-003', 2, 15000),
(1, 'SKU-005', 1, 18000),
(1, 'SKU-008', 1, 48000),
(2, 'SKU-002', 2, 32000),
(2, 'SKU-007', 1, 95000);

-- Reset sequence after manual ID insert
SELECT setval('sales_orders_id_seq', (SELECT MAX(id) FROM sales_orders));
# StockFlow — Inventory & Sales (Mini ERP)

A full-stack inventory management system for warehouse supervisors to manage products, adjust stock, and record sales orders.

**Stack:** Go + PostgreSQL (backend) | React + TypeScript + Vite (frontend)

## How to Run

### Prerequisites
- Go 1.24+
- Node.js 22+
- PostgreSQL 14+

### 1. Database Setup

```bash
# Create database
psql -U postgres -c "CREATE DATABASE stockflow_db;"

# Run migrations and seed
psql -U postgres -d stockflow_db -f backend/migrations/001_schema.sql
psql -U postgres -d stockflow_db -f backend/migrations/002_seed.sql
```

### 2. Backend

```bash
cd backend

# Set database URL (adjust password as needed)
# Windows PowerShell:
$env:DATABASE_URL="postgres://postgres:admin@localhost:5432/stockflow_db?sslmode=disable"

# Linux/Mac:
# export DATABASE_URL="postgres://postgres:admin@localhost:5432/stockflow_db?sslmode=disable"

go run ./cmd/main.go
# Server runs on http://localhost:8080
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# Opens on http://localhost:5173
```

### 4. Run Tests

```bash
cd backend
go test ./internal/ -v
```

## API Examples (curl)

```bash
# List products
curl http://localhost:8080/api/products

# Search products
curl "http://localhost:8080/api/products?search=beras&page=1&limit=20"

# Create product
curl -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"SKU-NEW","name":"New Product","price":10000}'

# Update product
curl -X PUT http://localhost:8080/api/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name","price":80000}'

# Delete product (fails if has movement history)
curl -X DELETE http://localhost:8080/api/products/1

# Adjust stock (in)
curl -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"in","qty":50,"note":"restock from supplier"}'

# Adjust stock (out)
curl -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"out","qty":10,"note":"damaged goods"}'

# Get movement history
curl http://localhost:8080/api/products/1/movements

# Create order
curl -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customer":"Toko Barokah","items":[{"sku":"SKU-001","qty":2},{"sku":"SKU-003","qty":5}]}'

# Get order detail
curl http://localhost:8080/api/orders/1

# Cancel order (restores stock)
curl -X POST http://localhost:8080/api/orders/1/cancel
```

## Design Decisions

### Concurrency Safety (Core Focus)

- **Stock decrements use atomic SQL guards:**
  ```sql
  UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1
  ```
  This single statement prevents negative stock even under concurrent requests. If two requests race, the second one sees the already-decremented value and fails atomically — no application-level mutex needed.

- **Order creation uses `SELECT ... FOR UPDATE`** to acquire row-level locks on product rows within a transaction. Concurrent orders for the same SKU are serialized at the database level, ensuring the "check stock → decrement" sequence is atomic.

- **All stock mutations happen inside database transactions.** If any item in an order fails, the entire transaction rolls back — no partial stock decrements.

### Architecture

- **Backend (Go + chi):** Clean handler-based architecture with a shared `Handler` struct holding the DB connection pool. Each endpoint is a method on this struct. No ORM — raw SQL with `pgx` for maximum control over transactions and locking.

- **Frontend (React + TypeScript + Vite):** One centralized `api.ts` module owns all `fetch` calls. Components never construct URLs or parse responses directly. TypeScript strict mode with shared type definitions matching the API contract exactly.

- **Error propagation (cross-stack):** Backend returns structured JSON errors:
  ```json
  {"error":{"code":"INSUFFICIENT_STOCK","sku":"SKU-001","available":5}}
  ```
  The frontend `api.ts` module parses these and throws typed error objects. UI components catch and display user-friendly messages (e.g., "Insufficient stock for SKU-001. Available: 5") — never just console errors.

### `last_movement_at` Field

Derived via subquery on each product fetch:
```sql
(SELECT MAX(sm.created_at) FROM stock_movements sm WHERE sm.product_id = p.id)
```
Trade-off: slightly more query cost vs. zero risk of data inconsistency from a denormalized column. For 12-100 products this is negligible.

### CORS

Frontend dev server runs on `localhost:5173`, backend on `localhost:8080`. CORS middleware is configured to allow cross-origin requests from the frontend origin.

## What I Would Improve

- **Dedicated test database** — currently tests run against dev DB, risking side effects
- **Concurrency test** with `go test -race` and parallel goroutines hitting the same SKU
- **Idempotency-Key** on `POST /api/orders` to prevent double-orders on network retry
- **Docker Compose** with all services (Go backend + Vite frontend + Postgres) for one-command startup
- **Frontend unit tests** with Vitest for validation logic and API client
- **Skeleton loading** rows and smoother transitions for better UX
- **Pagination** on orders list page

## Time Spent

~6 hours focused effort

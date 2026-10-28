package internal_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"stockflow/internal"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func setupTestDB(t *testing.T) *pgxpool.Pool {
	ctx := context.Background()
	dsn := "postgres://postgres:admin@localhost:5432/stockflow_db?sslmode=disable"
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("Failed to connect to test DB: %v", err)
	}
	return pool
}

func TestAdjustStock_HappyPath(t *testing.T) {
	pool := setupTestDB(t)
	defer pool.Close()
	h := internal.NewHandler(pool)

	// Get current stock for product 1
	var stockBefore int
	err := pool.QueryRow(context.Background(),
		"SELECT stock FROM products WHERE id = 1",
	).Scan(&stockBefore)
	if err != nil {
		t.Fatalf("Failed to get stock: %v", err)
	}

	// Adjust stock: add 10
	body, _ := json.Marshal(map[string]interface{}{
		"type": "in",
		"qty":  10,
		"note": "test restock",
	})

	r := chi.NewRouter()
	r.Post("/api/products/{id}/stock", h.AdjustStock)

	req := httptest.NewRequest("POST", "/api/products/1/stock", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify stock increased
	var stockAfter int
	err = pool.QueryRow(context.Background(),
		"SELECT stock FROM products WHERE id = 1",
	).Scan(&stockAfter)
	if err != nil {
		t.Fatalf("Failed to get stock: %v", err)
	}

	if stockAfter != stockBefore+10 {
		t.Errorf("Stock should be %d, got %d", stockBefore+10, stockAfter)
	}
	
	// Verify movement was recorded
	var movementCount int
	err = pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM stock_movements WHERE product_id = 1 AND note = 'test restock'",
	).Scan(&movementCount)
	if err != nil {
		t.Fatalf("Failed to count movements: %v", err)
	}
	if movementCount == 0 {
		t.Error("Movement was not recorded")
	}
}

func TestAdjustStock_InsufficientStock(t *testing.T) {
	pool := setupTestDB(t)
	defer pool.Close()
	h := internal.NewHandler(pool)

	// Get current stock
	var stockBefore int
	err := pool.QueryRow(context.Background(),
		"SELECT stock FROM products WHERE id = 1",
	).Scan(&stockBefore)
	if err != nil {
		t.Fatalf("Failed to get stock: %v", err)
	}

	// Try to withdraw way more than available
	body, _ := json.Marshal(map[string]interface{}{
		"type": "out",
		"qty":  999999,
		"note": "should fail",
	})

	r := chi.NewRouter()
	r.Post("/api/products/{id}/stock", h.AdjustStock)

	req := httptest.NewRequest("POST", "/api/products/1/stock", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Should return 409
	if w.Code != 409 {
		t.Fatalf("Expected 409, got %d: %s", w.Code, w.Body.String())
	}

	// Verify stock UNCHANGED
	var stockAfter int
	err = pool.QueryRow(context.Background(),
		"SELECT stock FROM products WHERE id = 1",
	).Scan(&stockAfter)
	if err != nil {
		t.Fatalf("Failed to get stock: %v", err)
	}

	if stockAfter != stockBefore {
		t.Errorf("Stock should be unchanged (%d), but got %d", stockBefore, stockAfter)
	}

	// Verify NO movement was recorded
	var movementCount int
	err = pool.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM stock_movements WHERE product_id = 1 AND note = 'should fail'",
	).Scan(&movementCount)
	if err != nil {
		t.Fatalf("Failed to count movements: %v", err)
	}
	if movementCount != 0 {
		t.Error("Movement should NOT have been recorded for failed stock out")
	}
}
package internal

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// Adjust stock (In/Out)
func (h *Handler) AdjustStock(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	productID, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, 400, "INVALID_ID", "id must be a number")
		return
	}

	var req StockAdjustRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "INVALID_JSON", "invalid request body")
		return
	}

	if req.Type != "in" && req.Type != "out" {
		writeError(w, 400, "VALIDATION_ERROR", "type must be 'in' or 'out'")
		return
	}
	if req.Qty <= 0 {
		writeError(w, 400, "VALIDATION_ERROR", "qty must be > 0")
		return
	}

	// Start Transaction
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to begin transaction")
		return
	}
	defer tx.Rollback(r.Context())

	if req.Type == "out" {
		// Atomic update with stock check - prevents negative stock
		result, err := tx.Exec(r.Context(),
			"UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1",
			req.Qty, productID,
		)
		if err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to update stock")
			return
		}
		if result.RowsAffected() == 0 {
			// Check if product exists or insufficient stock
			var currentStock int
			err := h.DB.QueryRow(r.Context(),
				"SELECT stock FROM products WHERE id = $1", productID,
			).Scan(&currentStock)
			if err != nil {
				writeError(w, 404, "NOT_FOUND", "product not found")
				return
			}
			writeJSON(w, 409, ErrorResponse{
				Error: ErrorDetail{
					Code:      "INSUFFICIENT_STOCK",
					Available: currentStock,
				},
			})
			return
		}
	} else {
		// Type "in" - always succeeds
		result, err := tx.Exec(r.Context(),
			"UPDATE products SET stock = stock + $1 WHERE id = $2",
			req.Qty, productID,
		)
		if err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to update stock")
			return
		}
		if result.RowsAffected() == 0 {
			writeError(w, 404, "NOT_FOUND", "product not found")
			return
		}
	}

	// Insert movement record
	_, err = tx.Exec(r.Context(),
		"INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, $2, $3, $4)",
		productID, req.Type, req.Qty, req.Note,
	)
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to insert movement")
		return
	}

	// Commit transaction
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to commit transaction")
		return
	}

	w.WriteHeader(200)
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

// List stock movements
func (h *Handler) GetMovements(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	productID, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, 400, "INVALID_ID", "id must be a number")
		return
	}

	// Check product exists
	var exists bool
	err = h.DB.QueryRow(r.Context(),
		"SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)", productID,
	).Scan(&exists)
	if err != nil || !exists {
		writeError(w, 404, "NOT_FOUND", "product not found")
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, product_id, type, qty, note, created_at 
		 FROM stock_movements 
		 WHERE product_id = $1 
		 ORDER BY created_at DESC`,
		productID,
	)
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to query movements")
		return
	}
	defer rows.Close()

	movements := []StockMovement{}
	for rows.Next() {
		var m StockMovement
		err := rows.Scan(&m.ID, &m.ProductID, &m.Type, &m.Qty, &m.Note, &m.CreatedAt)
		if err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to scan movement")
			return
		}
		movements = append(movements, m)
	}

	writeJSON(w, 200, map[string]interface{}{"data": movements})
}

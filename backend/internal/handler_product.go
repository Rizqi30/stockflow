package internal

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// List Products
func (h *Handler) ListProducts(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(limitStr)
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Base query - derive last_movement_at from stock_movements table
	baseWhere := "WHERE 1=1"
	args := []interface{}{}
	argIdx := 1
	if search != "" {
		baseWhere += ` AND (LOWER(p.sku) LIKE LOWER($` + strconv.Itoa(argIdx) + `) OR LOWER(p.name) LIKE LOWER($` + strconv.Itoa(argIdx) + `))`
		args = append(args, "%"+search+"%")
		argIdx++
	}

	// Count total
	countQuery := `SELECT COUNT(*) FROM products p ` + baseWhere
	var total int
	err := h.DB.QueryRow(r.Context(), countQuery, args...).Scan(&total)
	if err != nil {
		log.Printf("Error counting products: %v", err)
		writeError(w, 500, "INTERNAL_ERROR", "failed to count products")
		return
	}

	// Fetch products with last_movement_at
	dataQuery := `
		SELECT p.id, p.sku, p.name, p.price, p.stock, p.is_active, p.created_at,
		       (SELECT MAX(sm.created_at) FROM stock_movements sm WHERE sm.product_id = p.id) as last_movement_at
		FROM products p
		` + baseWhere + `
		ORDER BY p.id ASC
		LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	args = append(args, limit, offset)

	rows, err := h.DB.Query(r.Context(), dataQuery, args...)
	if err != nil {
		log.Printf("Error querying products: %v", err)
		writeError(w, 500, "INTERNAL_ERROR", "failed to query products")
		return
	}
	defer rows.Close()

	products := []Product{}
	for rows.Next() {
		var p Product
		err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Price, &p.Stock, &p.IsActive, &p.CreatedAt, &p.LastMovementAt)
		if err != nil {
			log.Printf("Error scanning product: %v", err)
			writeError(w, 500, "INTERNAL_ERROR", "failed to scan product")
			return
		}
		products = append(products, p)
	}

	writeJSON(w, 200, map[string]interface{}{
		"data":  products,
		"page":  page,
		"limit": limit,
		"total": total,
	})
}

// Create Products
func (h *Handler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	var req CreateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "INVALID_JSON", "invalid request body")
		return
	}

	// Validasi
	req.SKU = strings.TrimSpace(req.SKU)
	req.Name = strings.TrimSpace(req.Name)
	if req.SKU == "" {
		writeError(w, 400, "VALIDATION_ERROR", "sku is required and must be unique")
		return
	}
	if req.Name == "" {
		writeError(w, 400, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.Price < 0 {
		writeError(w, 400, "VALIDATION_ERROR", "price must be >= 0")
		return
	}

	var product Product
	err := h.DB.QueryRow(r.Context(),
		`INSERT INTO products (sku, name, price) VALUES ($1, $2, $3)
		 RETURNING id, sku, name, price, stock, is_active, created_at`,
		req.SKU, req.Name, req.Price,
	).Scan(&product.ID, &product.SKU, &product.Name, &product.Price, &product.Stock, &product.IsActive, &product.CreatedAt)

	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			writeError(w, 400, "DUPLICATE_SKU", "sku already exists")
			return
		}
		log.Printf("Error creating product: %v", err)
		writeError(w, 500, "INTERNAL_ERROR", "failed to create product")
		return
	}

	writeJSON(w, 201, product)
}

// Update Products
func (h *Handler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, 400, "INVALID_ID", "id must be a number")
		return
	}

	var req UpdateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "INVALID_JSON", "invalid request body")
		return
	}

	// Build dynamic update
	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Name != nil {
		setClauses = append(setClauses, "name = $"+strconv.Itoa(argIdx))
		args = append(args, *req.Name)
		argIdx++
	}
	if req.Price != nil {
		setClauses = append(setClauses, "price = $"+strconv.Itoa(argIdx))
		args = append(args, *req.Price)
		argIdx++
	}
	if req.IsActive != nil {
		setClauses = append(setClauses, "is_active = $"+strconv.Itoa(argIdx))
		args = append(args, *req.IsActive)
		argIdx++
	}

	if len(setClauses) == 0 {
		writeError(w, 400, "VALIDATION_ERROR", "no fields to update")
		return
	}

	query := "UPDATE products SET " + strings.Join(setClauses, ", ") + " WHERE id = $" + strconv.Itoa(argIdx) +
		" RETURNING id, sku, name, price, stock, is_active, created_at"
	args = append(args, id)

	var product Product
	err = h.DB.QueryRow(r.Context(), query, args...).Scan(
		&product.ID, &product.SKU, &product.Name, &product.Price, &product.Stock, &product.IsActive, &product.CreatedAt,
	)
	if err != nil {
		writeError(w, 404, "NOT_FOUND", "product not found")
		return
	}

	writeJSON(w, 200, product)
}

// Delete Products
func (h *Handler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, 400, "INVALID_ID", "id must be a number")
		return
	}

	// Check if product has movement history
	var movementCount int
	err = h.DB.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM stock_movements WHERE product_id = $1", id,
	).Scan(&movementCount)
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to check movements")
		return
	}

	if movementCount > 0 {
		writeJSON(w, 409, ErrorResponse{
			Error: ErrorDetail{Code: "PRODUCT_HAS_HISTORY"},
		})
		return
	}

	result, err := h.DB.Exec(r.Context(), "DELETE FROM products WHERE id = $1", id)
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to delete product")
		return
	}

	if result.RowsAffected() == 0 {
		writeError(w, 404, "NOT_FOUND", "product not found")
		return
	}

	w.WriteHeader(204)
}

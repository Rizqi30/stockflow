package internal

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// Create Order (Atomic)
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	var req CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "INVALID_JSON", "invalid request body")
		return
	}

	// Validation (all before touching DB)
	if req.Customer == "" {
		writeError(w, 400, "VALIDATION_ERROR", "customer is required")
		return
	}
	if len(req.Items) == 0 {
		writeError(w, 400, "VALIDATION_ERROR", "items cannot be empty")
		return
	}

	// Check duplicate SKUs and qty <= 0
	skuSeen := map[string]bool{}
	for _, item := range req.Items {
		if item.SKU == "" {
			writeError(w, 400, "VALIDATION_ERROR", "item sku is required")
			return
		}
		if item.Qty <= 0 {
			writeError(w, 400, "VALIDATION_ERROR", "item qty must be > 0")
			return
		}
		if skuSeen[item.SKU] {
			writeError(w, 400, "VALIDATION_ERROR", "duplicate sku in order: "+item.SKU)
			return
		}
		skuSeen[item.SKU] = true
	}

	// Start Transaction
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to begin transaction")
		return
	}
	defer tx.Rollback(r.Context())

	// Process each item: lookup price, decrement stock atomically
	type processedItem struct {
		SKU       string
		Qty       int
		UnitPrice int
	}
	var items []processedItem
	var total int

	for _, item := range req.Items {
		// Get product price and lock row with FOR UPDATE
		var productID int
		var price int
		var stock int
		err := tx.QueryRow(r.Context(),
			"SELECT id, price, stock FROM products WHERE sku = $1 FOR UPDATE",
			item.SKU,
		).Scan(&productID, &price, &stock)
		if err != nil {
			writeError(w, 400, "VALIDATION_ERROR", "unknown sku: "+item.SKU)
			return
		}

		// Check stock sufficiency
		if stock < item.Qty {
			writeJSON(w, 409, ErrorResponse{
				Error: ErrorDetail{
					Code:      "INSUFFICIENT_STOCK",
					SKU:       item.SKU,
					Available: stock,
				},
			})
			return
		}

		// Decrement stock atomically
		_, err = tx.Exec(r.Context(),
			"UPDATE products SET stock = stock - $1 WHERE id = $2",
			item.Qty, productID,
		)
		if err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to update stock")
			return
		}

		// Record stock movement (type: out)
		_, err = tx.Exec(r.Context(),
			"INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, 'out', $2, $3)",
			productID, item.Qty, "sales order",
		)
		if err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to record movement")
			return
		}

		items = append(items, processedItem{
			SKU:       item.SKU,
			Qty:       item.Qty,
			UnitPrice: price,
		})
		total += price * item.Qty
	}

	// Insert sales order
	var orderID int
	err = tx.QueryRow(r.Context(),
		"INSERT INTO sales_orders (customer, total) VALUES ($1, $2) RETURNING id",
		req.Customer, total,
	).Scan(&orderID)
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to create order")
		return
	}

	// Insert order items
	orderItems := []SalesOrderItem{}
	for _, item := range items {
		var itemID int
		err = tx.QueryRow(r.Context(),
			`INSERT INTO sales_order_items (order_id, sku, qty, unit_price) 
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			orderID, item.SKU, item.Qty, item.UnitPrice,
		).Scan(&itemID)
		if err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to insert order item")
			return
		}
		orderItems = append(orderItems, SalesOrderItem{
			ID:        itemID,
			OrderID:   orderID,
			SKU:       item.SKU,
			Qty:       item.Qty,
			UnitPrice: item.UnitPrice,
		})
	}

	// Commit!
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to commit transaction")
		return
	}

	// Return created order
	order := SalesOrder{
		ID:       orderID,
		Customer: req.Customer,
		Status:   "CREATED",
		Total:    total,
		Items:    orderItems,
	}
	writeJSON(w, 201, order)
}

// Get Order Detail
func (h *Handler) GetOrder(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, 400, "INVALID_ID", "id must be a number")
		return
	}

	var order SalesOrder
	err = h.DB.QueryRow(r.Context(),
		"SELECT id, customer, status, total, created_at, cancelled_at FROM sales_orders WHERE id = $1",
		id,
	).Scan(&order.ID, &order.Customer, &order.Status, &order.Total, &order.CreatedAt, &order.CancelledAt)
	if err != nil {
		writeError(w, 404, "NOT_FOUND", "order not found")
		return
	}

	// Get items
	rows, err := h.DB.Query(r.Context(),
		"SELECT id, order_id, sku, qty, unit_price FROM sales_order_items WHERE order_id = $1",
		id,
	)
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to query items")
		return
	}
	defer rows.Close()

	order.Items = []SalesOrderItem{}
	for rows.Next() {
		var item SalesOrderItem
		err := rows.Scan(&item.ID, &item.OrderID, &item.SKU, &item.Qty, &item.UnitPrice)
		if err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to scan item")
			return
		}
		order.Items = append(order.Items, item)
	}

	writeJSON(w, 200, order)
}

// Cancel Order
func (h *Handler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, 400, "INVALID_ID", "id must be a number")
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to begin transaction")
		return
	}
	defer tx.Rollback(r.Context())

	// Lock and check current status
	var status string
	err = tx.QueryRow(r.Context(),
		"SELECT status FROM sales_orders WHERE id = $1 FOR UPDATE", id,
	).Scan(&status)
	if err != nil {
		writeError(w, 404, "NOT_FOUND", "order not found")
		return
	}
	if status == "CANCELLED" {
		writeError(w, 409, "ALREADY_CANCELLED", "order is already cancelled")
		return
	}

	// Get order items to restore stock
	rows, err := tx.Query(r.Context(),
		"SELECT sku, qty FROM sales_order_items WHERE order_id = $1", id,
	)
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to query items")
		return
	}
	defer rows.Close()

	type itemRestore struct {
		SKU string
		Qty int
	}
	var restoreItems []itemRestore
	for rows.Next() {
		var item itemRestore
		if err := rows.Scan(&item.SKU, &item.Qty); err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to scan item")
			return
		}
		restoreItems = append(restoreItems, item)
	}
	rows.Close()

	// Restore stock for each item
	for _, item := range restoreItems {
		_, err = tx.Exec(r.Context(),
			"UPDATE products SET stock = stock + $1 WHERE sku = $2",
			item.Qty, item.SKU,
		)
		if err != nil {
			writeError(w, 500, "INTERNAL_ERROR", "failed to restore stock")
			return
		}

		// Record movement (type: in, note: order cancelled)
		_, err = tx.Exec(r.Context(),
			`INSERT INTO stock_movements (product_id, type, qty, note) 
			 VALUES ((SELECT id FROM products WHERE sku = $1), 'in', $2, $3)`,
			item.SKU, item.Qty, "order cancelled - order #"+strconv.Itoa(id),
		)
		if err != nil {
			log.Printf("Error recording cancel movement: %v", err)
		}
	}

	// Update order status
	_, err = tx.Exec(r.Context(),
		"UPDATE sales_orders SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1",
		id,
	)
	if err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to cancel order")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, 500, "INTERNAL_ERROR", "failed to commit")
		return
	}

	writeJSON(w, 200, map[string]string{"status": "cancelled"})
}


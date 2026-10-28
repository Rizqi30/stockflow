import { useState, useEffect, useCallback, useRef } from "react";
import { getProducts } from "./api";
import type { Product, ProductListResponse } from "./types";
import ProductsPage from "./ProductsPage";
import OrderForm from "./OrderForm";
import OrderDetail from "./OrderDetail";
import "./App.css";

type Page = "products" | "create-order" | "order-detail";

function App() {
  const [page, setPage] = useState<Page>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "low">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setSuccessMessage(""), 3000);
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res: ProductListResponse = await getProducts(search, currentPage, 20);
      let filtered = res.data;
      if (filter === "active") filtered = filtered.filter((p) => p.is_active);
      if (filter === "inactive") filtered = filtered.filter((p) => !p.is_active);
      if (filter === "low") filtered = filtered.filter((p) => p.stock <= 10);
      setProducts(filtered);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [search, currentPage, filter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Summary data
  const totalProducts = total;
  const activeProducts = products.filter((p) => p.is_active).length;
  const totalStockValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);
  const lowStockCount = products.filter((p) => p.stock <= 10).length;

  const formatRupiah = (n: number) =>
    "Rp " + n.toLocaleString("id-ID");

  return (
    <div className="app">
      {/* Success Toast */}
      {successMessage && (
        <div className="toast toast-success" key={successMessage}>
          ✅ {successMessage}
        </div>
      )}

      <div className="app-header">
        <h1>📦 StockFlow</h1>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="label">Total Products</div>
          <div className="value">{totalProducts}</div>
        </div>
        <div className="summary-card">
          <div className="label">Active Products</div>
          <div className="value">{activeProducts}</div>
        </div>
        <div className="summary-card">
          <div className="label">Total Stock Value</div>
          <div className="value price">{formatRupiah(totalStockValue)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Low Stock (≤10)</div>
          <div className="value" style={{ color: lowStockCount > 0 ? "#dc2626" : "#059669" }}>
            {lowStockCount}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${page === "products" ? "active" : ""}`}
          onClick={() => setPage("products")}
        >
          Products
        </button>
        <button
          className={`tab ${page === "create-order" ? "active" : ""}`}
          onClick={() => setPage("create-order")}
        >
          Create Order
        </button>
      </div>

      {/* Page Content */}
      {page === "products" && (
        <ProductsPage
          products={products}
          loading={loading}
          error={error}
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          currentPage={currentPage}
          total={total}
          onPageChange={setCurrentPage}
          onRefresh={fetchProducts}
          showSuccess={showSuccess}
        />
      )}

      {page === "create-order" && (
        <OrderForm
          onSuccess={(orderId) => {
            setSelectedOrderId(orderId);
            setPage("order-detail");
            fetchProducts();
            showSuccess("Order created successfully!");
          }}
          onCancel={() => setPage("products")}
        />
      )}

      {page === "order-detail" && selectedOrderId && (
        <OrderDetail
          orderId={selectedOrderId}
          onBack={() => {
            setPage("products");
            fetchProducts();
          }}
        />
      )}
    </div>
  );
}

export default App;

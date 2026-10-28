import { useState } from "react";
import { Loader2, PackageOpen, AlertCircle, RotateCw } from "lucide-react";
import type { Product } from "./types";
import StockModal from "./StockModal";

interface Props {
  products: Product[];
  loading: boolean;
  error: string;
  search: string;
  onSearchChange: (s: string) => void;
  filter: "all" | "active" | "inactive" | "low";
  onFilterChange: (f: "all" | "active" | "inactive" | "low") => void;
  currentPage: number;
  total: number;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
  showSuccess?: (msg: string) => void;
}

export default function ProductsPage({
  products,
  loading,
  error,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  currentPage,
  total,
  onPageChange,
  onRefresh,
  showSuccess,
}: Props) {
  const [stockModal, setStockModal] = useState<Product | null>(null);
  const [searchInput, setSearchInput] = useState(search);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      onSearchChange(value);
      onPageChange(1);
    }, 400);
    setDebounceTimer(timer);
  };

  const formatRupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <div className="table-container">
        <div className="toolbar">
          <input
            className="search-input"
            type="text"
            placeholder="Search by SKU or Name..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <div className="filter-group">
            {(["all", "active", "inactive", "low"] as const).map((f) => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? "active" : ""}`}
                onClick={() => { onFilterChange(f); onPageChange(1); }}
              >
                {f === "low" ? "Low Stock" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Error state with retry */}
        {error && (
          <div className="alert alert-error" style={{ margin: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
            <button className="btn btn-sm btn-outline" onClick={onRefresh} style={{ marginLeft: 12 }}>
              <RotateCw size={14} /> Retry
            </button>
          </div>
        )}

        {/* Loading state with Lucide Spinner */}
        {loading ? (
          <div className="loading">
            <Loader2 className="spinner" size={36} />
            <span>Loading products...</span>
          </div>
        ) : !error && products.length === 0 ? (
          /* Empty state */
          <div className="empty-state">
            <PackageOpen size={48} color="#94a3b8" style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 16 }}>No products found</div>
            <p style={{ fontSize: 13, marginTop: 4, color: "#64748b" }}>Try adjusting your search or filter</p>
            <button className="btn btn-sm btn-outline" onClick={onRefresh} style={{ marginTop: 14 }}>
              <RotateCw size={14} /> Refresh
            </button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Last Movement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.sku}</strong></td>
                  <td>{p.name}</td>
                  <td className="price">{formatRupiah(p.price)}</td>
                  <td>
                    {p.stock}
                    {p.stock <= 10 && (
                      <span className="badge low-stock" style={{ marginLeft: 8 }}>Low</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${p.is_active ? "active" : "inactive"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{formatTimeAgo(p.last_movement_at)}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setStockModal(p)}
                      >
                        Adjust Stock
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <span>
              Page {currentPage} of {totalPages} ({total} products)
            </span>
            <div className="actions">
              <button
                className="btn btn-sm btn-outline"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
              >
                Previous
              </button>
              <button
                className="btn btn-sm btn-outline"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {stockModal && (
        <StockModal
          product={stockModal}
          onClose={() => setStockModal(null)}
          onSuccess={() => {
            setStockModal(null);
            onRefresh();
            if (showSuccess) {
              showSuccess(`Stock adjusted for ${stockModal.sku} successfully!`);
            }
          }}
        />
      )}
    </>
  );
}

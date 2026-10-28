import { useState } from "react";
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
  showSuccess: (msg: string) => void;
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

        {error && <div className="alert alert-error" style={{ margin: 16 }}>{error}</div>}

        {loading ? (
          <div className="loading">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="empty-state">No products found</div>
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
            showSuccess(`Stock adjusted for ${stockModal.sku} successfully!`);
          }}
        />
      )}
    </>
  );
}

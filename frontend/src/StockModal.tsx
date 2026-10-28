import { useState } from "react";
import { adjustStock } from "./api";
import type { Product } from "./types";

interface Props {
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StockModal({ product, onClose, onSuccess }: Props) {
  const [type, setType] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const qtyNum = parseInt(qty) || 0;
  const isValid = qtyNum > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    setError("");
    try {
      await adjustStock(product.id, { type, qty: qtyNum, note });
      onSuccess();
    } catch (err: any) {
      if (err.code === "INSUFFICIENT_STOCK") {
        setError(`Insufficient stock. Available: ${err.available}`);
      } else {
        setError(err.message || "Failed to adjust stock");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Adjust Stock — {product.sku}</h2>
        <p style={{ color: "#666", marginBottom: 16 }}>
          {product.name} • Current stock: <strong>{product.stock}</strong>
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-group">
          <label>Direction</label>
          <select value={type} onChange={(e) => setType(e.target.value as "in" | "out")}>
            <option value="in">Stock In (+)</option>
            <option value="out">Stock Out (-)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Quantity</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Enter quantity"
          />
        </div>

        <div className="form-group">
          <label>Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. restock from supplier"
          />
        </div>

        <div className="form-actions">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!isValid || loading}
            onClick={handleSubmit}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

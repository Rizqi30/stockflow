import { useState } from "react";
import { createOrder } from "./api";

interface Props {
  onSuccess: (orderId: number) => void;
  onCancel: () => void;
}

export default function OrderForm({ onSuccess, onCancel }: Props) {
  const [customer, setCustomer] = useState("");
  const [items, setItems] = useState([{ sku: "", qty: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const addItem = () => {
    setItems([...items, { sku: "", qty: "" }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: "sku" | "qty", value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async () => {
    setError("");

    if (!customer.trim()) {
      setError("Customer name is required");
      return;
    }

    const parsedItems = items.map((item) => ({
      sku: item.sku.trim(),
      qty: parseInt(item.qty) || 0,
    }));

    // Validate items
    for (const item of parsedItems) {
      if (!item.sku) {
        setError("All items must have a SKU");
        return;
      }
      if (item.qty <= 0) {
        setError("All items must have qty > 0");
        return;
      }
    }

    setLoading(true);
    try {
      const order = await createOrder({ customer: customer.trim(), items: parsedItems });
      onSuccess(order.id);
    } catch (err: any) {
      if (err.code === "INSUFFICIENT_STOCK") {
        setError(`Insufficient stock for ${err.sku}. Available: ${err.available}`);
      } else {
        setError(err.message || "Failed to create order");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="table-container" style={{ padding: 28 }}>
      <h2 style={{ marginBottom: 20 }}>Create New Order</h2>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group">
        <label>Customer Name</label>
        <input
          type="text"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="e.g. Toko Barokah"
        />
      </div>

      <div className="form-group">
        <label>Order Items</label>
        <div className="order-items">
          {items.map((item, index) => (
            <div key={index} className="order-item-row">
              <input
                type="text"
                placeholder="SKU (e.g. SKU-001)"
                value={item.sku}
                onChange={(e) => updateItem(index, "sku", e.target.value)}
              />
              <input
                type="number"
                placeholder="Qty"
                min="1"
                value={item.qty}
                onChange={(e) => updateItem(index, "qty", e.target.value)}
              />
              <button
                className="btn btn-sm btn-danger"
                onClick={() => removeItem(index)}
                disabled={items.length <= 1}
              >
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn-sm btn-outline" onClick={addItem} style={{ marginTop: 8 }}>
            + Add Item
          </button>
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={loading}
          onClick={handleSubmit}
        >
          {loading ? "Creating..." : "Create Order"}
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { getOrder, cancelOrder } from "./api";
import type { SalesOrder } from "./types";

interface Props {
  orderId: number;
  onBack: () => void;
}

export default function OrderDetail({ orderId, onBack }: Props) {
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const data = await getOrder(orderId);
      setOrder(data);
    } catch (err: any) {
      setError(err.message || "Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this order? Stock will be restored.")) return;
    setCancelling(true);
    try {
      await cancelOrder(orderId);
      fetchOrder(); // Reload to show updated status
    } catch (err: any) {
      setError(err.message || "Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  };

  const formatRupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

  if (loading) {
    return (
      <div className="loading">
        <Loader2 className="spinner" size={36} />
        <span>Loading order...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error" style={{ margin: 20 }}>
        <AlertCircle size={18} />
        <span>{error}</span>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="table-container" style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2>Order #{order.id}</h2>
        <button className="btn btn-outline" onClick={onBack}>← Back to Products</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ color: "#888", fontSize: 13 }}>Customer</div>
          <div style={{ fontWeight: 600 }}>{order.customer}</div>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: 13 }}>Status</div>
          <span className={`badge ${order.status.toLowerCase()}`}>{order.status}</span>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: 13 }}>Total</div>
          <div style={{ fontWeight: 600 }} className="price">{formatRupiah(order.total)}</div>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: 13 }}>Created</div>
          <div>{new Date(order.created_at).toLocaleString("id-ID")}</div>
        </div>
      </div>

      <h3 style={{ marginBottom: 12 }}>Items</h3>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.sku}</strong></td>
              <td>{item.qty}</td>
              <td className="price">{formatRupiah(item.unit_price)}</td>
              <td className="price">{formatRupiah(item.unit_price * item.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {order.status === "CREATED" && (
        <div style={{ marginTop: 20 }}>
          <button
            className="btn btn-danger"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? "Cancelling..." : "Cancel Order"}
          </button>
        </div>
      )}

      {order.status === "CANCELLED" && (
        <div className="alert alert-error" style={{ marginTop: 16 }}>
          Order was cancelled on {new Date(order.cancelled_at!).toLocaleString("id-ID")}
        </div>
      )}
    </div>
  );
}

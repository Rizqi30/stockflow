export interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  created_at: string;
  last_movement_at: string | null;
}
export interface StockMovement {
  id: number;
  product_id: number;
  type: "in" | "out";
  qty: number;
  note: string;
  created_at: string;
}
export interface SalesOrder {
  id: number;
  customer: string;
  status: "CREATED" | "CANCELLED";
  total: number;
  items: SalesOrderItem[];
  created_at: string;
  cancelled_at?: string;
}
export interface SalesOrderItem {
  id: number;
  order_id: number;
  sku: string;
  qty: number;
  unit_price: number;
}
export interface ProductListResponse {
  data: Product[];
  page: number;
  limit: number;
  total: number;
}
export interface ApiError {
  error: {
    code: string;
    message?: string;
    sku?: string;
    available?: number;
  };
}

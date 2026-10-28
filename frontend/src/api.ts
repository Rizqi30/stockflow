import type {
  Product,
  ProductListResponse,
  StockMovement,
  SalesOrder,
  ApiError,
} from "./types";

const BASE_URL = "http://localhost:8080/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = body as ApiError | null;
    throw {
      status: res.status,
      code: err?.error?.code ?? "UNKNOWN",
      message: err?.error?.message ?? res.statusText,
      sku: err?.error?.sku,
      available: err?.error?.available,
    };
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// Products
export function getProducts(
  search = "",
  page = 1,
  limit = 20
): Promise<ProductListResponse> {
  const params = new URLSearchParams({
    search,
    page: String(page),
    limit: String(limit),
  });
  return request(`/products?${params}`);
}

export function createProduct(data: {
  sku: string;
  name: string;
  price: number;
}): Promise<Product> {
  return request("/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProduct(
  id: number,
  data: { name?: string; price?: number; is_active?: boolean }
): Promise<Product> {
  return request(`/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteProduct(id: number): Promise<void> {
  return request(`/products/${id}`, { method: "DELETE" });
}

// Stock
export function adjustStock(
  productId: number,
  data: { type: "in" | "out"; qty: number; note: string }
): Promise<void> {
  return request(`/products/${productId}/stock`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getMovements(
  productId: number
): Promise<{ data: StockMovement[] }> {
  return request(`/products/${productId}/movements`);
}

// Orders
export function createOrder(data: {
  customer: string;
  items: { sku: string; qty: number }[];
}): Promise<SalesOrder> {
  return request("/orders", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getOrder(id: number): Promise<SalesOrder> {
  return request(`/orders/${id}`);
}

export function cancelOrder(id: number): Promise<void> {
  return request(`/orders/${id}/cancel`, { method: "POST" });
}

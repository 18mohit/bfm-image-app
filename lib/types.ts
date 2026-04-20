// Types for Daily Orders Dashboard

export interface OrderItem {
  sku: string;
  quantity: number;
}

export interface ProductWithImage {
  sku: string;
  quantity: number;
  imageUrl: string | null;
}

export interface OrderData {
  items: ProductWithImage[];
  uploadedAt: number;
}

// Monthly aggregate
export type MonthlyProduct = ProductWithImage;
export interface MonthlyData {
  items: MonthlyProduct[];
}

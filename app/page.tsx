"use client";
// Daily Orders Dashboard - Using MongoDB Data API
import { useState, useEffect, useCallback } from "react";
import { FileUpload } from "@/components/file-upload";
import { OrdersGrid } from "@/components/orders-grid";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2, Settings } from "lucide-react";
import Link from "next/link";
import type { OrderItem, ProductWithImage } from "@/lib/types";

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const STORAGE_KEY = "daily-orders-data";

interface StoredData {
  items: OrderItem[];
  uploadedAt: number;
}

export default function DailyOrdersPage() {
  const [products, setProducts] = useState<ProductWithImage[]>([]);
  const [uploadedAt, setUploadedAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProductImages = useCallback(
    async (items: OrderItem[]): Promise<ProductWithImage[]> => {
      try {
        const skus = items.map((item) => item.sku).join(",");
        const response = await fetch(`/api/products?skus=${encodeURIComponent(skus)}`);
        
        if (!response.ok) {
          throw new Error("Failed to fetch product images");
        }

        const { skuImageMap } = await response.json();

        return items.map((item) => ({
          ...item,
          imageUrl: skuImageMap[item.sku.toUpperCase()] || null,
        }));
      } catch (err) {
        console.error("Error fetching product images:", err);
        setError("Could not load images. Check your database connection.");
        return items.map((item) => ({ ...item, imageUrl: null }));
      }
    },
    []
  );

  const loadStoredData = useCallback(async () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data: StoredData = JSON.parse(stored);
        const elapsed = Date.now() - data.uploadedAt;

        if (elapsed < TWELVE_HOURS) {
          setIsRefreshing(true);
          const productsWithImages = await fetchProductImages(data.items);
          setProducts(productsWithImages);
          setUploadedAt(data.uploadedAt);
          setIsRefreshing(false);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [fetchProductImages]);

  useEffect(() => {
    loadStoredData();
  }, [loadStoredData]);

  useEffect(() => {
    if (uploadedAt) {
      const timeLeft = uploadedAt + TWELVE_HOURS - Date.now();
      if (timeLeft > 0) {
        const timer = setTimeout(() => {
          setProducts([]);
          setUploadedAt(null);
          localStorage.removeItem(STORAGE_KEY);
        }, timeLeft);
        return () => clearTimeout(timer);
      }
    }
  }, [uploadedAt]);

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const parseResponse = await fetch("/api/parse", {
        method: "POST",
        body: formData,
      });

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        throw new Error(errorData.error || "Failed to parse file");
      }

      const { items, uploadedAt: timestamp } = await parseResponse.json();

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ items, uploadedAt: timestamp })
      );

      const productsWithImages = await fetchProductImages(items);
      setProducts(productsWithImages);
      setUploadedAt(timestamp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process file");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (products.length === 0) return;

    setIsRefreshing(true);
    setError(null);
    try {
      const items = products.map(({ sku, quantity }) => ({ sku, quantity }));
      const refreshedProducts = await fetchProductImages(items);
      setProducts(refreshedProducts);
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClear = () => {
    setProducts([]);
    setUploadedAt(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2 text-balance">
              Daily Orders Dashboard
            </h1>
            <p className="text-muted-foreground">
              Upload your order CSV to view products with images
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Manage Products
            </Button>
          </Link>
        </header>

        <div className="mb-8">
          <FileUpload onUpload={handleFileUpload} isLoading={isLoading} />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
            {error}
          </div>
        )}

        {isRefreshing && (
          <div className="mb-6 flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading images...</span>
          </div>
        )}

        {products.length > 0 && uploadedAt && (
          <>
            <div className="flex gap-2 mb-6">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
                />
                Refresh Images
              </Button>
              <Button variant="outline" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Orders
              </Button>
            </div>

            <OrdersGrid
              products={products}
              expiresAt={uploadedAt + TWELVE_HOURS}
            />
          </>
        )}

        {!isLoading && !isRefreshing && products.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No orders loaded. Upload a CSV file to get started.</p>
            <p className="mt-2 text-sm">
              First, add your products and image URLs in the{" "}
              <Link href="/admin" className="underline hover:text-foreground">
                Product Manager
              </Link>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

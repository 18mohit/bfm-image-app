"use client";

import { useState, useEffect, useCallback } from "react";
import { FileUpload } from "@/components/file-upload";
import { OrdersGrid } from "@/components/orders-grid";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2, Settings } from "lucide-react";
import Link from "next/link";
import type { OrderItem, ProductWithImage } from "@/lib/types";

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export default function DailyOrdersPage() {
  const [products, setProducts] = useState<ProductWithImage[]>([]);
  const [uploadedAt, setUploadedAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Fetch images from DB
  const fetchProductImages = useCallback(
    async (items: OrderItem[]): Promise<ProductWithImage[]> => {
      try {
        const skus = items.map((item) => item.sku).join(",");
        const response = await fetch(
          `/api/products?skus=${encodeURIComponent(skus)}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch product images");
        }

        const { skuImageMap } = await response.json();

        return items.map((item) => ({
          ...item,
          imageUrl: skuImageMap[item.sku.toUpperCase()] || null,
        }));
      } catch (err) {
        console.error(err);
        setError("Could not load images.");
        return items.map((item) => ({ ...item, imageUrl: null }));
      }
    },
    []
  );

  // ✅ LOAD DATA FROM DATABASE (IMPORTANT)
  const loadOrdersFromDB = useCallback(async () => {
    try {
      setIsRefreshing(true);

      const res = await fetch("/api/orders");
      const data = await res.json();

      if (data?.items) {
        const productsWithImages = await fetchProductImages(data.items);
        setProducts(productsWithImages);
        setUploadedAt(data.uploadedAt);
      }

      setIsRefreshing(false);
    } catch (err) {
      console.error(err);
      setIsRefreshing(false);
    }
  }, [fetchProductImages]);

  useEffect(() => {
    loadOrdersFromDB();
  }, [loadOrdersFromDB]);

  // ✅ AUTO CLEAR AFTER 12 HOURS
  useEffect(() => {
    if (uploadedAt) {
      const timeLeft = uploadedAt + TWELVE_HOURS - Date.now();

      if (timeLeft > 0) {
        const timer = setTimeout(() => {
          setProducts([]);
          setUploadedAt(null);
        }, timeLeft);

        return () => clearTimeout(timer);
      }
    }
  }, [uploadedAt]);

  // ✅ UPLOAD FILE
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

      // ✅ GET DATA FROM PARSER
      const { items, uploadedAt } = await parseResponse.json();

      // ✅ SAVE TO DATABASE (MAIN FIX 🔥)
      await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items, uploadedAt }),
      });

      // ✅ FETCH IMAGES
      const productsWithImages = await fetchProductImages(items);

      setProducts(productsWithImages);
      setUploadedAt(uploadedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ REFRESH
  const handleRefresh = async () => {
    if (products.length === 0) return;

    setIsRefreshing(true);

    try {
      const items = products.map(({ sku, quantity }) => ({
        sku,
        quantity,
      }));

      const refreshed = await fetchProductImages(items);
      setProducts(refreshed);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ✅ CLEAR UI ONLY
const handleClear = async () => {
  setProducts([]);
  setUploadedAt(null);
  setError(null);

  // 🔥 delete from DB
  await fetch("/api/orders", {
    method: "DELETE",
  });
};

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">
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
          <div className="mb-6 p-4 bg-red-100 border rounded">
            {error}
          </div>
        )}

        {isRefreshing && (
          <div className="mb-6 flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}

        {products.length > 0 && uploadedAt && (
          <>
            <div className="flex gap-2 mb-6">
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>

              <Button variant="outline" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>

            <OrdersGrid
              products={products}
              expiresAt={uploadedAt + TWELVE_HOURS}
            />
          </>
        )}

        {products.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            No orders loaded.
          </div>
        )}
      </div>
    </main>
  );
}
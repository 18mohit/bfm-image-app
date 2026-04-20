"use client";

import { useState, useEffect, useCallback } from "react";
import { FileUpload } from "@/components/file-upload";
import { OrdersGrid } from "@/components/orders-grid";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2, Settings } from "lucide-react";
import Link from "next/link";
import type { OrderItem, ProductWithImage, MonthlyData } from "@/lib/types";

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export default function OrdersPage() {
  const [dailyProducts, setDailyProducts] = useState<ProductWithImage[]>([]);
  const [monthlyProducts, setMonthlyProducts] = useState<ProductWithImage[]>([]);
  const [uploadedAt, setUploadedAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("daily");

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

  // ✅ LOAD DAILY FROM DATABASE
  const loadDailyOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();

      if (data?.items && data.uploadedAt) {
        const productsWithImages = await fetchProductImages(data.items as OrderItem[]);
        setDailyProducts(productsWithImages);
        setUploadedAt(data.uploadedAt);
      } else {
        setDailyProducts([]);
        setUploadedAt(null);
      }
    } catch (err) {
      console.error(err);
    }
  }, [fetchProductImages]);

  // ✅ LOAD MONTHLY FROM DATABASE
  const loadMonthlyOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?monthly=true");
      const data = await res.json() as MonthlyData;

      if (data?.items && data.items.length > 0) {
        const productsWithImages = await fetchProductImages(data.items as OrderItem[]);
        setMonthlyProducts(productsWithImages);
      } else {
        setMonthlyProducts([]);
      }
    } catch (err) {
      console.error(err);
    }
  }, [fetchProductImages]);

  // Load both on mount/refresh
  const loadAllOrders = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadDailyOrders(), loadMonthlyOrders()]);
    setIsRefreshing(false);
  }, [loadDailyOrders, loadMonthlyOrders]);

  useEffect(() => {
    loadAllOrders();
  }, [loadAllOrders]);

  // ✅ UPLOAD FILE (reload both)
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

      const { items, uploadedAt } = await parseResponse.json();

      await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, uploadedAt }),
      });

      await loadAllOrders(); // Reload both tabs
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ REFRESH IMAGES (both tabs)
  const handleRefresh = async () => {
    if (dailyProducts.length === 0 && monthlyProducts.length === 0) return;

    setIsRefreshing(true);

    const allSkus = [...new Set([
      ...dailyProducts.map(p => p.sku),
      ...monthlyProducts.map(p => p.sku)
    ])];

    if (allSkus.length > 0) {
      const items = allSkus.map(sku => ({ sku, quantity: 0 } as OrderItem));
      const refreshedImages = await fetchProductImages(items);
      // Update both with new images
      setDailyProducts(dailyProducts.map(p => 
        refreshedImages.find(r => r.sku === p.sku)?.imageUrl !== undefined 
          ? { ...p, imageUrl: refreshedImages.find(r => r.sku === p.sku)?.imageUrl }
          : p
      ));
      setMonthlyProducts(monthlyProducts.map(p => 
        refreshedImages.find(r => r.sku === p.sku)?.imageUrl !== undefined 
          ? { ...p, imageUrl: refreshedImages.find(r => r.sku === p.sku)?.imageUrl }
          : p
      ));
    }

    setIsRefreshing(false);
  };

  // ✅ CLEAR DAILY ONLY
  const handleClearDaily = async () => {
    setDailyProducts([]);
    setUploadedAt(null);
    // API cleanup handled by GET
    await loadAllOrders(); // Reload monthly if affected
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Orders Dashboard</h1>
            <p className="text-muted-foreground">
              Daily uploads + monthly totals
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
          <div className="mb-6 p-4 bg-red-100 border rounded-lg text-red-900">
            {error}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {isRefreshing && (
          <div className="mb-6 flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}

        {(dailyProducts.length > 0 || monthlyProducts.length > 0) && (
          <>
            <div className="flex gap-2 mb-6">
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Images
              </Button>
              {uploadedAt && (
                <Button variant="outline" onClick={handleClearDaily}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Daily
                </Button>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="daily">Daily Orders</TabsTrigger>
                <TabsTrigger value="monthly">This Month Total</TabsTrigger>
              </TabsList>
              <TabsContent value="daily" className="mt-6">
                {dailyProducts.length > 0 ? (
                  <OrdersGrid
                    products={dailyProducts}
                    expiresAt={uploadedAt ? uploadedAt + TWELVE_HOURS : undefined}
                    title="Daily Orders"
                  />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No daily orders. Upload a file.
                  </div>
                )}
              </TabsContent>
              <TabsContent value="monthly" className="mt-6">
                {monthlyProducts.length > 0 ? (
                  <OrdersGrid
                    products={monthlyProducts}
                    title="This Month Total"
                  />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No monthly data yet.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        {dailyProducts.length === 0 && monthlyProducts.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            No orders loaded. Upload your first CSV.
          </div>
        )}
      </div>
    </main>
  );
}

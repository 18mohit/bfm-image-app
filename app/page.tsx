"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FileUpload } from "@/components/file-upload";
import { OrdersGrid } from "@/components/orders-grid";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2, Settings } from "lucide-react";
import Link from "next/link";
import type { OrderItem, ProductWithImage, MonthlyData } from "@/lib/types";

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

/** Returns the timestamp (ms) for midnight on the 1st of the current month */
function getStartOfCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/** Returns the timestamp (ms) for midnight on the 1st of next month */
function getStartOfNextMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
}

export default function OrdersPage() {
  const [dailyProducts, setDailyProducts] = useState<ProductWithImage[]>([]);
  const [monthlyProducts, setMonthlyProducts] = useState<ProductWithImage[]>([]);
  const [uploadedAt, setUploadedAt] = useState<number | null>(null);
  const [monthlyResetAt, setMonthlyResetAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("daily");

  // Refs for timers so we can clear them on unmount
  const dailyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monthlyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Fetch images from DB ────────────────────────────────────────────────────
  const fetchProductImages = useCallback(
    async (items: OrderItem[]): Promise<ProductWithImage[]> => {
      try {
        const skus = items.map((item) => item.sku).join(",");
        const response = await fetch(
          `/api/products?skus=${encodeURIComponent(skus)}`
        );

        if (!response.ok) throw new Error("Failed to fetch product images");

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

  // ─── Load daily orders (enforces 12-hour expiry on client) ───────────────────
  const loadDailyOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();

      if (data?.items && data.uploadedAt) {
        const age = Date.now() - data.uploadedAt;

        if (age >= TWELVE_HOURS) {
          // Expired – tell the server to clear it, then wipe local state
          await fetch("/api/orders", { method: "DELETE" });
          setDailyProducts([]);
          setUploadedAt(null);
          return;
        }

        const productsWithImages = await fetchProductImages(
          data.items as OrderItem[]
        );
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

  // ─── Load monthly orders (enforces month boundary) ───────────────────────────
  const loadMonthlyOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?monthly=true");
      const data = (await res.json()) as MonthlyData & { resetAt?: number };

      // If the server recorded the month-start when data was first stored,
      // compare it to the current month-start to detect a month rollover.
      const storedResetAt = data?.resetAt ?? null;
      const currentMonthStart = getStartOfCurrentMonth();

      if (storedResetAt !== null && storedResetAt < currentMonthStart) {
        // Data is from a previous month – archive/clear it on the server
        await fetch("/api/orders?monthly=true", { method: "DELETE" });
        setMonthlyProducts([]);
        setMonthlyResetAt(null);
        return;
      }

      if (data?.items && data.items.length > 0) {
        const productsWithImages = await fetchProductImages(
          data.items as OrderItem[]
        );
        setMonthlyProducts(productsWithImages);
        setMonthlyResetAt(storedResetAt);
      } else {
        setMonthlyProducts([]);
        setMonthlyResetAt(null);
      }
    } catch (err) {
      console.error(err);
    }
  }, [fetchProductImages]);

  // ─── Load both tabs ──────────────────────────────────────────────────────────
  const loadAllOrders = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadDailyOrders(), loadMonthlyOrders()]);
    setIsRefreshing(false);
  }, [loadDailyOrders, loadMonthlyOrders]);

  useEffect(() => {
    loadAllOrders();
  }, [loadAllOrders]);

  // ─── Auto-reset: daily (12 h) ────────────────────────────────────────────────
  useEffect(() => {
    if (dailyTimerRef.current) clearTimeout(dailyTimerRef.current);

    if (uploadedAt) {
      const msUntilExpiry = uploadedAt + TWELVE_HOURS - Date.now();
      if (msUntilExpiry > 0) {
        dailyTimerRef.current = setTimeout(async () => {
          await fetch("/api/orders", { method: "DELETE" });
          setDailyProducts([]);
          setUploadedAt(null);
        }, msUntilExpiry);
      }
    }

    return () => {
      if (dailyTimerRef.current) clearTimeout(dailyTimerRef.current);
    };
  }, [uploadedAt]);

  // ─── Auto-reset: monthly (1st of next month at midnight) ────────────────────
  useEffect(() => {
    if (monthlyTimerRef.current) clearTimeout(monthlyTimerRef.current);

    const msUntilNextMonth = getStartOfNextMonth() - Date.now();

    monthlyTimerRef.current = setTimeout(async () => {
      // Archive/clear on server, then reload fresh (new month = empty slate)
      await fetch("/api/orders?monthly=true", { method: "DELETE" });
      setMonthlyProducts([]);
      setMonthlyResetAt(null);
    }, msUntilNextMonth);

    return () => {
      if (monthlyTimerRef.current) clearTimeout(monthlyTimerRef.current);
    };
  }, []); // run once on mount; timer fires at month boundary

  // ─── Upload file ─────────────────────────────────────────────────────────────
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

      const { items, uploadedAt: parsedUploadedAt } = await parseResponse.json();

      // Save daily orders
      await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, uploadedAt: parsedUploadedAt }),
      });

      // Upsert today's slot in monthly totals.
      // dateKey identifies the day — same-day re-uploads replace, not add.
      const today = new Date();
      const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      await fetch("/api/orders?monthly=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          dateKey,                          // e.g. "2025-05-15" — server replaces this day's entry
          resetAt: getStartOfCurrentMonth(), // used to detect month rollover
        }),
      });

      await loadAllOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Refresh images (both tabs) ──────────────────────────────────────────────
  const handleRefresh = async () => {
    if (dailyProducts.length === 0 && monthlyProducts.length === 0) return;

    setIsRefreshing(true);

    const allSkus = [
      ...new Set([
        ...dailyProducts.map((p) => p.sku),
        ...monthlyProducts.map((p) => p.sku),
      ]),
    ];

    if (allSkus.length > 0) {
      const items = allSkus.map((sku) => ({ sku, quantity: 0 } as OrderItem));
      const refreshedImages = await fetchProductImages(items);

      const applyImages = (products: ProductWithImage[]) =>
        products.map((p) => {
          const match = refreshedImages.find((r) => r.sku === p.sku);
          return match ? { ...p, imageUrl: match.imageUrl } : p;
        });

      setDailyProducts(applyImages(dailyProducts));
      setMonthlyProducts(applyImages(monthlyProducts));
    }

    setIsRefreshing(false);
  };

  // ─── Manual clear (daily only) ───────────────────────────────────────────────
  const handleClearDaily = async () => {
    await fetch("/api/orders", { method: "DELETE" });
    setDailyProducts([]);
    setUploadedAt(null);
  };

  // ─── Derived: time until next monthly reset ──────────────────────────────────
  const msUntilNextMonth = getStartOfNextMonth() - Date.now();
  const daysUntilReset = Math.floor(msUntilNextMonth / (1000 * 60 * 60 * 24));
  const hoursUntilReset = Math.floor(
    (msUntilNextMonth % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );

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

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="daily">Daily Orders</TabsTrigger>
                <TabsTrigger value="monthly">This Month Total</TabsTrigger>
              </TabsList>

              <TabsContent value="daily" className="mt-6">
                {dailyProducts.length > 0 ? (
                  <OrdersGrid
                    products={dailyProducts}
                    expiresAt={
                      uploadedAt ? uploadedAt + TWELVE_HOURS : undefined
                    }
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
                    monthlyResetIn={
                      daysUntilReset > 0
                        ? `${daysUntilReset}d ${hoursUntilReset}h`
                        : `${hoursUntilReset}h`
                    }
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

        {dailyProducts.length === 0 &&
          monthlyProducts.length === 0 &&
          !isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              No orders loaded. Upload your first CSV.
            </div>
          )}
      </div>
    </main>
  );
}
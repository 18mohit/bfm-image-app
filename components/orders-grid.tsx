"use client";

import { ProductCard } from "@/components/product-card";
import type { ProductWithImage } from "@/lib/types";

interface OrdersGridProps {
  products: ProductWithImage[];
  expiresAt?: number;
  title?: string;
}

export function OrdersGrid({
  products,
  expiresAt,
  title = "Orders",
}: OrdersGridProps) {
  const totalQuantity = products.reduce(
    (sum, product) => sum + product.quantity,
    0,
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          {title} ({totalQuantity} total)
        </h2>
        {expiresAt && (
          <>
            {(() => {
              const timeLeft = Math.max(0, expiresAt - Date.now());
              const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
              const minutesLeft = Math.floor(
                (timeLeft % (1000 * 60 * 60)) / (1000 * 60),
              );
              return (
                <div className="text-sm text-muted-foreground">
                  Auto-clears in {hoursLeft}h {minutesLeft}m
                </div>
              );
            })()}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {[...products]
          .sort((a, b) => b.quantity - a.quantity)
          .map((product) => (
            <ProductCard key={product.sku} product={product} />
          ))}
      </div>
    </div>
  );
}

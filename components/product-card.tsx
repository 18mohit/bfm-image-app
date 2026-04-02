"use client";

import { useState } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ProductWithImage } from "@/lib/types";

interface ProductCardProps {
  product: ProductWithImage;
}

export function ProductCard({ product }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="h-70 relative bg-muted">
        {product.imageUrl && !imageError ? (
          <Image
            src={product.imageUrl}
            alt={product.sku}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <Package className="h-16 w-16 mb-2" />
            <span className="text-sm">No image</span>
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">SKU</p>
        <p className="font-semibold text-xs mb-3">{product.sku}</p>
        <div className="bg-primary/10 rounded-lg p-3 text-center">
          <p className="text-sm text-muted-foreground">Quantity</p>
          <p className="text-m font-bold text-primary">{product.quantity}</p>
        </div>
      </CardContent>
    </Card>
  );
}

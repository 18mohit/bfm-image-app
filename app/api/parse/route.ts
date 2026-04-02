import { NextRequest, NextResponse } from "next/server";
import type { OrderItem } from "@/lib/types";

function parseCSV(content: string): OrderItem[] {
  const lines = content.trim().split("\n");
  const items: OrderItem[] = [];

  // Skip header row if it exists
  const startIndex = lines[0]?.toLowerCase().includes("sku") ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle both comma and semicolon delimiters
    const parts = line.includes(";") ? line.split(";") : line.split(",");

    if (parts.length >= 2) {
      const sku = parts[0].trim().replace(/["']/g, "").toUpperCase();
      const quantity = parseInt(parts[1].trim().replace(/["']/g, ""), 10);

      if (sku && !isNaN(quantity) && quantity > 0) {
        items.push({ sku, quantity });
      }
    }
  }

  return items;
}

function groupOrders(items: OrderItem[]): OrderItem[] {
  const grouped: Record<string, number> = {};

  items.forEach(({ sku, quantity }) => {
    grouped[sku] = (grouped[sku] || 0) + quantity;
  });

  return Object.entries(grouped).map(([sku, quantity]) => ({
    sku,
    quantity,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".txt")) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a CSV file." },
        { status: 400 }
      );
    }

    const content = await file.text();
    const items = parseCSV(content);

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No valid order data found in file" },
        { status: 400 }
      );
    }

    const groupedItems = groupOrders(items);

    return NextResponse.json({
      items: groupedItems,
      uploadedAt: Date.now(),
    });
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse file" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import type { OrderItem } from "@/lib/types";

const DATABASE = "BFMImage";
const COLLECTION = "Orders";

// ✅ SAVE ORDERS (append daily upload)
export async function POST(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db(DATABASE);

    const body = await request.json();
    const { items, uploadedAt } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    // Insert new daily doc (no delete)
    await db.collection(COLLECTION).insertOne({
      items,
      uploadedAt,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ORDER SAVE ERROR:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save orders" },
      { status: 500 },
    );
  }
}

// ✅ GET LATEST DAILY ORDERS (12h expiry check)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isMonthly = searchParams.get("monthly") === "true";

  try {
    const client = await clientPromise;
    const db = client.db(DATABASE);
    const now = Date.now();
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;

    // Cleanup expired dailies (12h) AND old monthly data (before current month)
    const currentMonthStart = new Date(now);
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);
    const monthStartTimestamp = currentMonthStart.getTime();

    await db.collection(COLLECTION).deleteMany({
      $or: [
        { uploadedAt: { $lt: now - TWELVE_HOURS } }, // expired daily
        { uploadedAt: { $lt: monthStartTimestamp } }, // before current month
      ],
    });

    if (isMonthly) {
      // Aggregate current month only
      const pipeline = [
        { $match: { uploadedAt: { $gte: monthStartTimestamp } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.sku",
            totalQuantity: { $sum: "$items.quantity" },
          },
        },
        { $sort: { totalQuantity: -1 } },
      ];

      const aggregates = await db
        .collection(COLLECTION)
        .aggregate(pipeline)
        .toArray();
      const items: OrderItem[] = aggregates.map((a) => ({
        sku: a._id,
        quantity: a.totalQuantity,
      }));

      return NextResponse.json({ items });
    } else {
      // Latest daily (first non-expired)
      const data = await db
        .collection(COLLECTION)
        .find({ uploadedAt: { $gte: now - TWELVE_HOURS } })
        .sort({ uploadedAt: -1 })
        .limit(1)
        .toArray();

      if (data.length === 0) {
        return NextResponse.json({ items: [], uploadedAt: null });
      }

      const latest = data[0];
      return NextResponse.json({
        items: latest.items,
        uploadedAt: latest.uploadedAt,
      });
    }
  } catch (error: any) {
    console.error("ORDER FETCH ERROR:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders" },
      { status: 500 },
    );
  }
}

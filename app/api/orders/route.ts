import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const DATABASE = "BFMImage";
const COLLECTION = "Orders";

// ✅ SAVE ORDERS (called when you upload Excel)
export async function POST(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db(DATABASE);

    const body = await request.json();
    const { items, uploadedAt } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No items provided" },
        { status: 400 }
      );
    }

    // 🔥 OPTIONAL: delete old data (so only latest upload exists)
    await db.collection(COLLECTION).deleteMany({});

    // ✅ insert new data
    await db.collection(COLLECTION).insertOne({
      items,
      uploadedAt,
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("ORDER SAVE ERROR:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save orders" },
      { status: 500 }
    );
  }
}


// ✅ GET ORDERS (called when app loads on ANY device)
export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(DATABASE);

    const data = await db.collection(COLLECTION).findOne({});

    if (!data) {
      return NextResponse.json({ items: [], uploadedAt: null });
    }

    const now = Date.now();
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;

    // 🔥 AUTO DELETE IF EXPIRED
    if (now - data.uploadedAt > TWELVE_HOURS) {
      await db.collection(COLLECTION).deleteMany({});

      return NextResponse.json({ items: [], uploadedAt: null });
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error("ORDER FETCH ERROR:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
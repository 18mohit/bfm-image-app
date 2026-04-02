import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";


console.log("MONGODB_URI:", process.env.MONGODB_URI);

const DATABASE = "BFMImage";
const COLLECTION = "All Image";

// MongoDB field names
const SKU_FIELD = "A";
const IMAGE_URL_FIELD = "B";


// ✅ GET
export async function GET(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db(DATABASE);
    
    const { searchParams } = new URL(request.url);
    const skusParam = searchParams.get("skus");

    if (skusParam) {
      const skus = skusParam.split(",").map((s) => s.trim().toUpperCase());

      const products = await db
        .collection(COLLECTION)
        .find({ [SKU_FIELD]: { $in: skus } })
        .toArray();

      const skuImageMap: Record<string, string> = {};

      products.forEach((product: any) => {
      if (product[SKU_FIELD] && product[IMAGE_URL_FIELD]) {
      let url = product[IMAGE_URL_FIELD];

    // ✅ FIX Dropbox link
     url = url.replace("www.dropbox.com", "dl.dropboxusercontent.com");

      skuImageMap[product[SKU_FIELD]] = url;
      }
      });
      return NextResponse.json({ skuImageMap });
    }

    // Get all products
    const products = await db.collection(COLLECTION).find({}).toArray();

    const transformedProducts = products.map((p: any) => ({
      sku: p[SKU_FIELD],
      imageUrl: p[IMAGE_URL_FIELD],
    }));

    return NextResponse.json({ products: transformedProducts });

  } catch (error: any) {
  console.error("FULL ERROR:", error);
  return NextResponse.json(
    { error: error.message || error.toString() },
    { status: 500 }
  );
}
}

// ✅ POST
export async function POST(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db(DATABASE);

    const body = await request.json();
    const { sku, imageUrl } = body;

    if (!sku || !imageUrl) {
      return NextResponse.json(
        { error: "SKU and imageUrl required" },
        { status: 400 }
      );
    }

    const result = await db.collection(COLLECTION).updateOne(
      { [SKU_FIELD]: sku.toUpperCase() },
      {
        $set: {
          [SKU_FIELD]: sku.toUpperCase(),
          [IMAGE_URL_FIELD]: imageUrl,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      modifiedCount: result.modifiedCount,
    });

  } catch (error) {
    console.error("Error adding product:", error);
    return NextResponse.json(
      { error: "Failed to add product" },
      { status: 500 }
    );
  }
}

// ✅ DELETE
export async function DELETE(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db(DATABASE);

    const { searchParams } = new URL(request.url);
    const sku = searchParams.get("sku");

    if (!sku) {
      return NextResponse.json(
        { error: "SKU required" },
        { status: 400 }
      );
    }

    const result = await db.collection(COLLECTION).deleteOne({
      [SKU_FIELD]: sku.toUpperCase(),
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });

  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    );
  }
}
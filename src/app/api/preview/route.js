import { NextResponse } from "next/server";
import { db } from "../../../lib/firebaseAdmin";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId parameter" }, { status: 400 });
  }

  try {
    const snapshot = await db.collection("convertedHtml")
      .where("sessionId", "==", sessionId)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ error: "No previews found for this session" }, { status: 404 });
    }

    const previews = snapshot.docs.map(doc => ({
      id: doc.id,
      filename: doc.data().filename,
      htmlBase64: doc.data().htmlBase64,
      cssBase64: doc.data().cssBase64 || "",
      imageBase64s: doc.data().imageBase64s || {},
      zipBase64: doc.data().zipBase64,
      createdAt: doc.data().createdAt,
    }));

    return NextResponse.json({ previews });
  } catch (error) {
    console.error("Error fetching previews:", error);
    return NextResponse.json({ error: `Failed to fetch previews: ${error.message}` }, { status: 500 });
  }
}
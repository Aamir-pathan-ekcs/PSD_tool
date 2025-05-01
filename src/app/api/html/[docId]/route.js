import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebaseAdmin";
import { doc, getDoc } from "firebase-admin/firestore";

// if (!firebaseAdmin.apps.length) {
//   firebaseAdmin.initializeApp({
//     credential: firebaseAdmin.credential.cert({
//       projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
//       clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
//       privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
//     }),
//   });
// }
// const db = firebaseAdmin.firestore();

export async function GET(request, { params }) {

  const { docId } = params; // Direct destructuring is fine in App Router

  try {
    const docRef = db.collection("convertedHtml").doc(docId); // Use db.collection().doc()
    const docSnap = await docRef.get(); // Use .get() directly

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const data = docSnap.data();
    return NextResponse.json({
      htmlBase64: data.htmlBase64,
      cssBase64: data.cssBase64 || "",
      imageBase64s: data.imageBase64s || {},
    });
  } catch (error) {
    console.error("Error fetching HTML from Firestore:", error);
    return NextResponse.json(
      { error: `Failed to fetch HTML: ${error.message}` },
      { status: 500 }
    );
  }
}
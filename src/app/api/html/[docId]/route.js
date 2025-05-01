import { NextResponse } from "next/server";
import firebaseAdmin from "firebase-admin";

if (!firebaseAdmin.apps.length) {
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}
const db = firebaseAdmin.firestore();

export async function GET(request, { params }) {
  const { docId } = params;

  try {
    const docRef = doc(db, "convertedHtml", docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { html } = docSnap.data();
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Error fetching HTML from Firestore:", error);
    return NextResponse.json(
      { error: `Failed to fetch HTML: ${error.message}` },
      { status: 500 }
    );
  }
}
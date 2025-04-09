import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  try {
    const { filename } = params;
    const decodedFilename = decodeURIComponent(filename);
    const filePath = path.join(process.cwd(), "output", decodedFilename);
    const baseDir = path.dirname(decodedFilename); // e.g., "Business_Dental_PictureLed2_160x600"

    let content = await fs.readFile(filePath, "utf-8");

    // Rewrite only style.css href
    content = content.replace(/href="(\.\/)?css\/style\.css"/g, (match, dot) => {
      const fullPath = path.join(baseDir, "css/style.css").replace(/\\/g, "/"); // Normalize to forward slashes
      return `href="/api/asset/${encodeURIComponent(fullPath)}"`;
    });

    // Rewrite image sources (keep existing logic since it works)
    content = content.replace(/src="(\.\/)?([^"]+\.(png|jpg|jpeg|gif))"/g, (match, dot, p1) => {
      const fullPath = path.join(baseDir, p1).replace(/\\/g, "/"); // Normalize to forward slashes
      return `src="/api/asset/${encodeURIComponent(fullPath)}"`;
    });

    // Log the rewritten content for debugging
    console.log("Rewritten HTML content:", content);

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("Error serving HTML file:", error);
    return NextResponse.json(
      { error: `Failed to serve HTML file: ${error.message}` },
      { status: 500 }
    );
  }
}
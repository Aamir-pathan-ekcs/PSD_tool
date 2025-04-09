import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  try {
    const { filepath } = params;
    const decodedFilepath = decodeURIComponent(filepath);
    const filePath = path.join(process.cwd(), "output", decodedFilepath);

    const content = await fs.readFile(filePath);

    const ext = path.extname(decodedFilepath).toLowerCase();
    const contentType = {
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
    }[ext] || "application/octet-stream";

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Error serving asset:", error.message, "Filepath:", decodedFilepath);
    return NextResponse.json(
      { error: `Failed to serve asset: ${error.message}` },
      { status: 500 }
    );
  }
}
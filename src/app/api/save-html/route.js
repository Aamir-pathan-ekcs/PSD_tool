import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { filename, content } = await request.json();

    if (!filename || !content) {
      return NextResponse.json({ error: "Filename and content are required" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "output", filename);
    await fs.writeFile(filePath, content, "utf-8");

    return NextResponse.json({ message: "HTML file saved successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error saving HTML file:", error);
    return NextResponse.json(
      { error: `Failed to save HTML file: ${error.message}` },
      { status: 500 }
    );
  }
}
import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

async function getHtmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const htmlFiles = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recursively get HTML files from subdirectories
      const subFiles = await getHtmlFiles(fullPath);
      htmlFiles.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      htmlFiles.push({
        name: entry.name,
        folder: path.basename(path.dirname(fullPath)),
        url: `/api/html/${encodeURIComponent(path.join(path.basename(path.dirname(fullPath)), entry.name))}`,
      });
    }
  }
  return htmlFiles;
}

export async function GET() {
  try {
    const outputDir = path.join(process.cwd(), "output");
    const htmlFiles = await getHtmlFiles(outputDir);

    return NextResponse.json(htmlFiles, { status: 200 });
  } catch (error) {
    console.error("Error listing HTML files:", error);
    return NextResponse.json(
      { error: `Failed to list HTML files: ${error.message}` },
      { status: 500 }
    );
  }
}
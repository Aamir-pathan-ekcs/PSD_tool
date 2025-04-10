// app/api/clean-folder/route.ts or route.js
import fs from "fs/promises";
import path from "path";

export async function POST() {
  const outputDir = path.join(process.cwd(), "output");
  
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(outputDir, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      }
    }

    return new Response(JSON.stringify({ message: "Output folder cleaned!" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error cleaning folder:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

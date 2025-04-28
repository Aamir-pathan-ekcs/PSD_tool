import { exec } from "child-process-promise";
import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Use Render's /tmp directory for temporary files
    const uploadDir = "/tmp/uploads";
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, file.name);

    // Stream the file to avoid body size limits
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, fileBuffer);

    // Run the Python script (ensure Python is available on Render)
    const pythonScriptPath = path.join(process.cwd(), "scripts", "convert_psd.py");
    const { stdout, stderr } = await exec(`python3 "${pythonScriptPath}" "${filePath}"`, {
      encoding: "binary" // Ensure binary output for ZIP file
    });

    // Log stderr for debugging
    if (stderr) {
      console.error("Python script stderr:", stderr);
      if (!stdout) {
        throw new Error(stderr);
      }
    }

    // Convert stdout to a Buffer (ZIP content)
    const zipBuffer = Buffer.from(stdout, "binary");

    // Clean up temporary files
    await fs.unlink(filePath).catch(err => console.error("Cleanup error:", err));

    // Return the ZIP file as a response
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=converted_html.zip",
      },
    });
  } catch (error) {
    console.error("Error in API route:", error);
    return NextResponse.json(
      { error: `Failed to convert PSD: ${error.message}` },
      { status: 500 }
    );
  }
}
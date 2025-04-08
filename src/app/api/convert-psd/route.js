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

    // Save the uploaded zip temporarily
    const uploadDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, file.name);
    const fileBuffer = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(fileBuffer));

    // Run the Python script
    const pythonScriptPath = path.join(process.cwd(), "scripts", "convert_psd.py");
    const { stdout, stderr } = await exec(`python "${pythonScriptPath}" "${filePath}"`);

    // Log stderr for debugging
    if (stderr) {
      console.error("Python script stderr:", stderr);
      // Only throw an error if stdout is empty (indicating a failure)
      if (!stdout) {
        throw new Error(stderr);
      }
    }

    // The stdout is the binary zip content
    const zipBuffer = Buffer.from(stdout, 'binary');

    // Clean up
    await fs.unlink(filePath);

    // Return the zip file as a response
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
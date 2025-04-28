import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";

const execPromise = promisify(exec);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const uploadDir = "/tmp/uploads";
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, file.name);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, fileBuffer);

    const pythonScriptPath = path.join(process.cwd(), "scripts", "convert_psd.py");
    const { stdout, stderr } = await execPromise(`python3 "${pythonScriptPath}" "${filePath}"`, {
      encoding: "binary"
    });

    if (stderr) {
      console.error("Python script stderr:", stderr);
      if (!stdout) throw new Error(stderr);
    }

    const zipBuffer = Buffer.from(stdout, "binary");

    await fs.unlink(filePath).catch(err => console.error("Cleanup error:", err));

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
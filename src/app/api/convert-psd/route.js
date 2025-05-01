import { NextResponse } from "next/server";
import { db } from "../../../lib/firebaseAdmin";
import * as fs from "fs/promises";
import * as path from "path";
import { execa } from "execa";

export async function POST(request) {
  console.log("API route /api/convert-psd called at:", new Date().toISOString());
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sessionId = formData.get("sessionId");

    if (!file || !sessionId) {
      console.error("Missing file or session ID");
      return NextResponse.json({ error: "Missing file or session ID" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadDir, { recursive: true }).catch((err) => {
      console.error("Failed to create upload directory:", err);
      throw err;
    });
    const zipPath = path.join(uploadDir, file.name);
    console.log("Saving ZIP file to:", zipPath);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(zipPath, fileBuffer).catch((err) => {
      console.error("Failed to write ZIP file:", err);
      throw err;
    });

    const pythonScriptPath = path.join(process.cwd(), "scripts", "convert_psd.py");
    console.log("Python script path:", pythonScriptPath);
    if (!(await fs.access(pythonScriptPath).then(() => true).catch(() => false))) {
      throw new Error("Python script not found at: " + pythonScriptPath);
    }

    console.log("Executing Python script with:", pythonScriptPath, zipPath);
    let stdout, stderr;
    try {
      const { stdout: execStdout, stderr: execStderr } = await execa("python", [
        pythonScriptPath,
        zipPath,
      ], { timeout: 120000 });
      stdout = execStdout;
      stderr = execStderr;
      console.log("Python stdout:", stdout);
      console.log("Python stderr:", stderr);
    } catch (execError) {
      stderr = execError.stderr || execError.message || "Execution failed";
      console.error(`Python script error for ${file.name}:`, stderr);
      return NextResponse.json({ error: stderr }, { status: 500 });
    }

    let result;
    try {
      result = JSON.parse(stdout);
      console.log("Parsed result:", result);
    } catch (parseError) {
      console.error(`Failed to parse Python output for ${file.name}:`, parseError, stdout);
      return NextResponse.json({ error: `Invalid JSON output: ${stdout}` }, { status: 500 });
    }

    // Check if the top-level success is false
    if (!result.success) {
      console.error("Top-level success is false:", result.error || "Unknown error");
      return NextResponse.json({ error: result.error || "Processing failed" }, { status: 500 });
    }

    // Check if all nested results failed
    const nestedResults = result.results || result; // Fallback to result if no results key (for backward compatibility)
    if (Object.values(nestedResults).every(r => !r.success)) {
      const firstError = Object.values(nestedResults)[0]?.error || "Processing failed";
      console.error("All nested results failed:", firstError);
      return NextResponse.json({ error: firstError }, { status: 500 });
    }

    // Save each HTML result to Firestore
    const savePromises = Object.entries(nestedResults).map(([filename, data]) => {
      const htmlDocRef = db.collection("convertedHtml").doc(`${sessionId}_${filename.replace(".psd", ".html")}`);
      return htmlDocRef.set({
        sessionId,
        filename: `${sessionId}_${filename.replace(".psd", ".html")}`,
        html: data.html,
        createdAt: new Date().toISOString(),
      }).catch((err) => {
        console.error(`Failed to save to Firestore for ${filename}:`, err);
        throw err;
      });
    });

    await Promise.all(savePromises);
    console.log("Successfully saved all HTML results to Firestore");

    // Prepare the response
    const response = NextResponse.json({
      results: Object.entries(nestedResults).map(([filename, data]) => ({
        filename: `${sessionId}_${filename.replace(".psd", ".html")}`,
        htmlDocId: db.collection("convertedHtml").doc(`${sessionId}_${filename.replace(".psd", ".html")}`).id,
      })),
    });

    // Cleanup: Delete the ZIP file
    await fs.unlink(zipPath).catch((err) => {
      console.error("Failed to unlink ZIP:", err);
    });
    console.log("Cleaned up ZIP file:", zipPath);

    return response;
  } catch (error) {
    console.error("Error in API route:", error);
    return NextResponse.json({ error: `Failed to convert PSD: ${error.message}` }, { status: 500 });
  }
}
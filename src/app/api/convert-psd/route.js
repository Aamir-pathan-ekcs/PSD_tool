import { NextResponse } from "next/server";
import { db } from "../../../lib/firebaseAdmin";
import * as fs from "fs/promises";
import * as path from "path";
import { execa } from "execa";
import JSZip from "jszip";

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
      throw new Error(`Failed to create upload directory: ${err.message}`);
    });
    const zipPath = path.join(uploadDir, file.name);
    console.log("Saving ZIP file to:", zipPath);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(zipPath, fileBuffer).catch((err) => {
      console.error("Failed to write ZIP file:", err);
      throw new Error(`Failed to write ZIP file: ${err.message}`);
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
      throw new Error(`Python script execution failed: ${stderr}`);
    }

    let result;
    try {
      result = JSON.parse(stdout);
      console.log("Parsed result:", result);
    } catch (parseError) {
      console.error(`Failed to parse Python output for ${file.name}:`, parseError, stdout);
      throw new Error(`Invalid JSON output from Python: ${stdout}`);
    }

    if (!result.success) {
      console.error("Top-level success is false:", result.error || "Unknown error");
      throw new Error(result.error || "Processing failed");
    }

    const nestedResults = result.results || {};
    if (Object.values(nestedResults).every(r => !r?.success)) {
      const firstError = Object.values(nestedResults)[0]?.error || "Processing failed";
      console.error("All nested results failed:", firstError);
      throw new Error(firstError);
    }

    // Save everything to Firestore
    const savePromises = Object.entries(nestedResults).map(async ([filename, data]) => {
      const docId = `${sessionId}_${filename.replace(".psd", ".html")}`;
      const htmlDocRef = db.collection("convertedHtml").doc(docId);

      // Safeguard against undefined html
      if (!data.html) {
        console.error(`No HTML data found for ${filename}:`, data);
        throw new Error(`Missing HTML data for ${filename}`);
      }

      // Encode HTML as base64
      const htmlBase64 = Buffer.from(data.html).toString("base64");

      // Encode CSS as base64 (if it exists)
      const cssBase64 = data.css ? Buffer.from(data.css).toString("base64") : "";
      if (!data.css) {
        console.warn(`No CSS data found for ${filename}`);
      }

      // Encode images as base64 (already in base64 from Python script)
      const imageBase64s = data.images || {};
      if (Object.keys(imageBase64s).length === 0) {
        console.warn(`No images found for ${filename}`);
      }

      // Generate ZIP file and encode as base64
      const zip = new JSZip();
      let htmlContent = data.html || ""; // Fallback to empty string if undefined
      const imgSrcRegex = /src=["'](.*?)["']/g;
      let match;
      while ((match = imgSrcRegex.exec(htmlContent)) !== null) {
        const src = match[1];
        if (!src.startsWith("images/")) {
          console.warn(`Unexpected image path in HTML for ${filename}: ${src}`);
        }
      }
      zip.file("index.html", htmlContent);

      // Add CSS to ZIP
      if (data.css) {
        zip.file("css/style.css", data.css);
        console.log(`Added CSS to ZIP for ${filename}: css/style.css`);
      } else {
        console.warn(`Skipping CSS addition to ZIP for ${filename}: No CSS data`);
      }

      // Add images to ZIP
      const imagesFolder = zip.folder("images");
      for (const [imgName, imgBase64] of Object.entries(imageBase64s)) {
        imagesFolder.file(imgName, Buffer.from(imgBase64, "base64"));
        console.log(`Added image to ZIP for ${filename}: images/${imgName}`);
      }

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });
      const zipBase64 = zipContent.toString("base64");

      // Save metadata to Firestore
      await htmlDocRef.set({
        sessionId,
        filename: docId,
        htmlBase64,
        cssBase64,
        imageBase64s,
        zipBase64,
        createdAt: new Date().toISOString(),
      });
    });

    await Promise.all(savePromises);
    console.log("Successfully saved all files to Firestore");

    const response = NextResponse.json({
      results: Object.entries(nestedResults).map(([filename, data]) => ({
        filename: `${sessionId}_${filename.replace(".psd", ".html")}`,
        htmlDocId: db.collection("convertedHtml").doc(`${sessionId}_${filename.replace(".psd", ".html")}`).id,
      })),
    });

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
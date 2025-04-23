import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { filename, content } = await request.json();

    if (!filename || !content) {
      return NextResponse.json({ error: "Filename and content are required" }, { status: 400 });
    }
  // Decode the filename
  // const decodedFilename = decodeURIComponent(filename);

  // // Split into directory and file (assuming filename is "dir/file" or "dir\file")
  // const lastSeparatorIndex = decodedFilename.lastIndexOf(path.sep);
  // let dirName, fileName;
  // if (lastSeparatorIndex === -1) {
  //   // No separator, assume it's just a file in the output root
  //   dirName = "output";
  //   fileName = decodedFilename;
  // } else {
  //   dirName = decodedFilename.substring(0, lastSeparatorIndex);
  //   fileName = decodedFilename.substring(lastSeparatorIndex + 1);
  // }

  // const dirPath = path.join(process.cwd(), "output", dirName); // e.g., output/Business_Dental_PictureLed2_160x600
  // const filePath = path.join(dirPath, fileName); // e.g., output/Business_Dental_PictureLed2_160x600/index.html

  // // Create directory if it doesn't exist
  // await fs.mkdir(dirPath, { recursive: true });

  // // Write the file
  // await fs.writeFile(filePath, content, "utf-8");
  // console.log(`Successfully saved file: ${filePath}`);
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
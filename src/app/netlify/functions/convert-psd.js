const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const { psdBase64, sessionId } = body;

    if (!psdBase64 || !sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing PSD data or session ID" }) };
    }

    // Decode base64 PSD file and save to /tmp
    const psdBuffer = Buffer.from(psdBase64, "base64");
    const tempPsdPath = path.join("/tmp", `${sessionId}_input.psd`);
    fs.writeFileSync(tempPsdPath, psdBuffer);

    // Run the Python script
    const pythonProcess = spawn("python3", ["./scripts/convert_psd.py", tempPsdPath]);
    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    return new Promise((resolve) => {
      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: `Python script failed: ${stderr}` }),
          });
        } else {
          const result = JSON.parse(stdout);
          if (result.success) {
            resolve({
              statusCode: 200,
              body: JSON.stringify({ html: result.html, filename: `${sessionId}_output.html` }),
            });
          } else {
            resolve({
              statusCode: 500,
              body: JSON.stringify({ error: result.error }),
            });
          }
        }
      });
    });
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Server error: ${error.message}` }),
    };
  }
};
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { db } from "../lib/firebase";
import { doc, setDoc, onSnapshot, collection, query, getDocs } from "firebase/firestore";

export default function Home() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [htmlFiles, setHtmlFiles] = useState({});
  const [previews, setPreviews] = useState([]);
  const [dimensions, setDimensions] = useState({});
  const [htmlDocs, setHtmlDocs] = useState([]);
  const fileInputRef = useRef(null);
  const [sessionId, setSessionId] = useState(null);
  const router = useRouter();



  // Fetch HTML files from Firestore
  useEffect(() => {
    const fetchHtmlFiles = async () => {
      try {
        if (!sessionId) return;

        const q = query(collection(db, "convertedHtml"));
        const querySnapshot = await getDocs(q);
        const filesData = {};
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.sessionId === sessionId) {
            const folder = data.filename.split("/")[0] || "default";
            if (!filesData[folder]) filesData[folder] = [];
            filesData[folder].push({ name: data.filename, url: `/api/html/${data.filename}`, docId: doc.id });
          }
        });

        // Fetch content and extract dimensions for each file
        const dimensionPromises = Object.values(filesData).flat().map(async (file) => {
          const filePath = file.url.replace("/api/html/", "");
          const contentResponse = await fetch(`/api/html/${file.docId}`);
          if (!contentResponse.ok) throw new Error(`Failed to fetch content for ${filePath}`);
          const content = await contentResponse.text();

          const parser = new DOMParser();
          const doc = parser.parseFromString(content, "text/html");
          const metaTag = doc.querySelector('meta[name="ad.size"]');
          let width = "100%";
          let height = "300px";
          if (metaTag) {
            const contentAttr = metaTag.getAttribute("content");
            const widthMatch = contentAttr.match(/width=(\d+)/);
            const heightMatch = contentAttr.match(/height=(\d+)/);
            if (widthMatch) width = `${widthMatch[1]}px`;
            if (heightMatch) height = `${heightMatch[1]}px`;
            console.log(`Extracted dimensions for ${filePath}: width=${width}, height=${height}`);
          } else {
            console.warn(`No ad.size meta tag found in ${filePath}, using default dimensions`);
          }

          return { filePath, width, height };
        });

        const dimensionsData = await Promise.all(dimensionPromises);
        const newDimensions = dimensionsData.reduce((acc, { filePath, width, height }) => ({
          ...acc,
          [filePath]: { width, height },
        }), {});
        setDimensions(newDimensions);

        setHtmlFiles(filesData);
      } catch (error) {
        console.error("Error fetching HTML files from Firestore:", error);
        setError("Failed to load HTML files");
      }
    };

    fetchHtmlFiles();
  }, [sessionId]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError("");
  };
  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", sessionId || Date.now().toString());

    try {
      const response = await fetch("/api/convert-psd", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");

      setSessionId(data.results[0]?.filename.split("_")[0]);
      fetchPreviews();
    } catch (err) {
      console.error("Error uploading file:", err);
      setError(err.message);
    }
  };

  const fetchPreviews = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/preview?sessionId=${sessionId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Fetch failed");

      setPreviews(data.previews);
    } catch (err) {
      console.error("Error fetching previews:", err);
      setError(err.message);
    }
  };

  const handleDownload = (zipBase64, filename) => {
    const binaryString = atob(zipBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getPreviewHtml = (preview) => {
    // Decode HTML from base64
    let htmlContent = atob(preview.htmlBase64);

    // Replace image URLs with data URLs
    let modifiedHtml = htmlContent;
    const imageBase64s = preview.imageBase64s || {};

    // Find all image src attributes to debug missing images
    const imgSrcRegex = /src=["'](.*?)["']/g;
    let match;
    while ((match = imgSrcRegex.exec(htmlContent)) !== null) {
      const src = match[1];
      if (src.startsWith("images/")) {
        const imgName = src.replace("images/", "");
        if (imageBase64s[imgName]) {
          const imgDataUrl = `data:image/${imgName.split('.').pop()};base64,${imageBase64s[imgName]}`;
          modifiedHtml = modifiedHtml.replace(new RegExp(src, 'g'), imgDataUrl);
        } else {
          console.warn(`Image not found in imageBase64s: ${imgName}`);
        }
      }
    }

    // Replace CSS URL with inline style tag
    if (preview.cssBase64) {
      const cssContent = atob(preview.cssBase64);
      modifiedHtml = modifiedHtml.replace(
        /<link rel="stylesheet" href="\.\/css\/style\.css" \/>/,
        `<style>${cssContent}</style>`
      );
    } else {
      console.warn("No CSS found in preview.cssBase64");
    }

    return modifiedHtml;
  };

  useEffect(() => {
    if (sessionId) fetchPreviews();
  }, [sessionId]);
  // const handleUpload = async () => {
  //   if (!file || !sessionId) {
  //     setError("Please select a file first or wait for session initialization!");
  //     return;
  //   }

  //   setIsLoading(true);
  //   setError("");

  //   const formData = new FormData();
  //   formData.append("file", file);
  //   formData.append("sessionId", sessionId);

  //   try {
  //     const response = await fetch("/api/convert-psd", {
  //       method: "POST",
  //       body: formData,
  //     });

  //     if (!response.ok) {
  //       const text = await response.text(); // Log raw response for debugging
  //       console.error("API Response (not OK):", text);
  //       throw new Error(`API error: ${text || "Unknown error"}`);
  //     }

  //     const contentType = response.headers.get("content-type");
  //     if (contentType && contentType.includes("application/json")) {
  //       const data = await response.json();
  //       if (data.results) {
  //         // Refresh HTML files from Firestore
  //         const fetchHtmlFiles = async () => {
  //           const q = query(collection(db, "convertedHtml"));
  //           const querySnapshot = await getDocs(q);
  //           const filesData = {};
  //           querySnapshot.forEach((doc) => {
  //             const data = doc.data();
  //             if (data.sessionId === sessionId) {
  //               const folder = data.filename.split("/")[0] || "default";
  //               if (!filesData[folder]) filesData[folder] = [];
  //               filesData[folder].push({ name: data.filename, url: `/api/html/${data.filename}`, docId: doc.id });
  //             }
  //           });

  //           const dimensionPromises = Object.values(filesData).flat().map(async (file) => {
  //             const filePath = file.url.replace("/api/html/", "");
  //             const contentResponse = await fetch(`/api/html/${file.docId}`);
  //             if (!contentResponse.ok) throw new Error(`Failed to fetch content for ${filePath}`);
  //             const content = await contentResponse.text();
  //             const parser = new DOMParser();
  //             const doc = parser.parseFromString(content, "text/html");
  //             const metaTag = doc.querySelector('meta[name="ad.size"]');
  //             let width = "100%";
  //             let height = "300px";
  //             if (metaTag) {
  //               const contentAttr = metaTag.getAttribute("content");
  //               const widthMatch = contentAttr.match(/width=(\d+)/);
  //               const heightMatch = contentAttr.match(/height=(\d+)/);
  //               if (widthMatch) width = `${widthMatch[1]}px`;
  //               if (heightMatch) height = `${heightMatch[1]}px`;
  //             }
  //             return { filePath, width, height };
  //           });
  //           const dimensionsData = await Promise.all(dimensionPromises);
  //           const newDimensions = dimensionsData.reduce((acc, { filePath, width, height }) => ({
  //             ...acc,
  //             [filePath]: { width, height },
  //           }), {});
  //           setDimensions(newDimensions);

  //           setHtmlFiles(filesData);
  //         };
  //         await fetchHtmlFiles();
  //       } else {
  //         throw new Error(data.error || "No results returned from conversion");
  //       }
  //     } else {
  //       throw new Error("Unexpected response format: Expected JSON");
  //     }
  //   } catch (error) {
  //     console.error("Error uploading file:", error);
  //     setError(`Failed to convert PSD: ${error.message}`);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  const downloadFile = (filePath) => {
    // Fetch HTML content from Firestore for download
    const fileDocRef = doc(db, "convertedHtml", filePath.replace("/api/html/", ""));
    onSnapshot(fileDocRef, (doc) => {
      if (doc.exists()) {
        const { html } = doc.data();
        const blob = new Blob([html], { type: "text/html" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${sessionId || "user"}_${filePath.split("/").pop()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        setError("File not found in Firestore");
      }
    }, (error) => {
      setError(`Failed to fetch file for download: ${error.message}`);
    });
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1500px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>PSD to HTML Converter</h1>
      <div style={{ marginBottom: "20px" }}>
    <div>
    <div>
      <form onSubmit={handleUpload}>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <button type="submit">Upload</button>
      </form>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      <h2>Previews</h2>
      {previews.length > 0 ? (
        previews.map((preview) => (
          <div key={preview.id} style={{ margin: "20px 0", border: "1px solid #ccc", padding: "10px" }}>
            <h3>{preview.filename}</h3>
            <div style={{ position: "relative", overflow: "hidden", maxWidth: "100%" }}>
              <iframe
                srcDoc={getPreviewHtml(preview)}
                title={preview.filename}
                style={{ width: "100%", height: "600px", border: "none" }}
                sandbox="allow-scripts"
              />
            </div>
            <button onClick={() => handleDownload(preview.zipBase64, preview.filename)}>
              Download Package
            </button>
          </div>
        ))
      ) : (
        <p>No previews available. Upload a file to generate one.</p>
      )}
    </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {htmlDocs.length > 0 && (
        <div>
          <h2>Converted HTML Documents:</h2>
          <ul>
            {htmlDocs.map((doc, index) => (
              <li key={index}>
                Filename: {doc.filename}, Doc ID: {doc.htmlDocId}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
        {/* <input
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          style={{ marginRight: "10px" }}
        />
        <button
          onClick={handleUpload}
          disabled={isLoading || !sessionId}
          style={{
            padding: "8px 16px",
            backgroundColor: isLoading || !sessionId ? "#ccc" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isLoading || !sessionId ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Converting..." : "Convert PSD"}
        </button> */}
        <button
          onClick={() => router.push("/edit")}
          style={{
            padding: "8px 16px",
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "4px",
            marginLeft: "10px",
            cursor: "pointer",
          }}
        >
          Edit HTML
        </button>
      </div>
      {error && <p style={{ color: "red", marginBottom: "20px" }}>{error}</p>}
  
      <h2 style={{ fontSize: "20px", marginTop: "20px" }}>Converted HTML Previews</h2>
      <div className="previewContent" style={{ display: "flex", gap: "22px", flexWrap: "wrap" }}>
        {Object.keys(htmlFiles).length > 0 ? (
          Object.keys(htmlFiles).map((folder) => (
            <div key={folder} style={{ marginBottom: "30px" }}>
              <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>{folder}</h3>
              <div style={{ display: "grid", gap: "20px" }}>
                {htmlFiles[folder].map((htmlFile, index) => {
                  const filePath = htmlFile.url.replace("/api/html/", "");
                  return (
                    <div key={index} style={{ border: "1px solid #ccc", padding: "10px" }}>
                      <h4>{htmlFile.name}</h4>
                      <iframe
                        src={`/api/html/${htmlFile.docId}`}
                        style={{
                          width: dimensions[filePath]?.width || "100%",
                          height: dimensions[filePath]?.height || "300px",
                          border: "none",
                        }}
                        title={`Preview of ${htmlFile.name}`}
                        sandbox="allow-same-origin allow-scripts"
                      />
                      <button
                        onClick={() => downloadFile(htmlFile.url)}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#0070f3",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          marginTop: "5px",
                          cursor: "pointer",
                        }}
                      >
                        Download
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <p>No HTML files available. Convert a PSD to see previews.</p>
        )}
      </div>
    </div>
  );
}
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
  const [dimensions, setDimensions] = useState({});
  const [htmlDocs, setHtmlDocs] = useState([]);
  const fileInputRef = useRef(null);
  const [sessionId, setSessionId] = useState(null);
  const router = useRouter();

  // Initialize sessionId on client side
  useEffect(() => {
    const storedSessionId = typeof window !== "undefined" ? localStorage.getItem("sessionId") : null;
    if (!storedSessionId) {
      const newSessionId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      if (typeof window !== "undefined") localStorage.setItem("sessionId", newSessionId);
      setSessionId(newSessionId);
    } else {
      setSessionId(storedSessionId);
    }
  }, []);

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
  async function handleUpload(e) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setHtmlDocs([]);

    if (!fileInputRef.current) {
      setError("File input element not found. Please refresh the page.");
      setIsLoading(false);
      console.error("fileInputRef.current is null");
      return;
    }

    const file = fileInputRef.current.files[0];
    if (!file) {
      setError("Please select a file to upload.");
      setIsLoading(false);
      return;
    }

    const sessionId = Date.now().toString();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sessionId", sessionId);

    try {
      console.log("Uploading file:", file.name);
      const response = await fetch("/api/convert-psd", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(120000), // Increased timeout to 60 seconds
      });

      const responseText = await response.text();
      console.log("API Response (raw):", responseText);

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
          console.log("API Response (parsed error):", errorData);
        } catch (parseError) {
          console.error("Failed to parse API response as JSON:", parseError);
          throw new Error(`API error: ${responseText}`);
        }
        throw new Error(`API error: ${errorData.error || "Unknown error"}`);
      }

      const data = JSON.parse(responseText);
      console.log("API Response (success):", data);
      setHtmlDocs(data.results || []);
    } catch (err) {
      console.error("Error uploading file:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }
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
      <form onSubmit={handleUpload}>
        <input
          type="file"
          ref={fileInputRef} // Ensure the ref is correctly assigned
          accept=".zip"
          required // Optional: Ensures a file must be selected
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Uploading..." : "Upload"}
        </button>
      </form>
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
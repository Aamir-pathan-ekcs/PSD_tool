"use client";

import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';

export default function Home() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [htmlFiles, setHtmlFiles] = useState({});
  const [dimensions, setDimensions] = useState({});
  const router = useRouter();
  const [psdFile, setPsdFile] = useState(null);
  const [convertedHtml, setConvertedHtml] = useState({});

  // Fetch HTML files from the output folder
  useEffect(() => {
    const fetchHtmlFiles = async () => {
      try {
        const response = await fetch("/api/list-html");
        if (!response.ok) throw new Error("Failed to fetch HTML files");
        const data = await response.json();

        // Group HTML files by folder
        const groupedFiles = data.reduce((acc, file) => {
          if (!acc[file.folder]) acc[file.folder] = [];
          acc[file.folder].push(file);
          return acc;
        }, {});

      // Fetch content and extract dimensions for each file
      const dimensionPromises = data.map(async (file) => {
        const filePath = file.url.replace("/api/html/", "");
        const contentResponse = await fetch(file.url);
        if (!contentResponse.ok) throw new Error(`Failed to fetch content for ${filePath}`);
        const content = await contentResponse.text();

        // Parse the HTML to extract dimensions
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        const metaTag = doc.querySelector('meta[name="ad.size"]');
        let width = "100%"; // Default width
        let height = "300px"; // Default height
        if (metaTag) {
          const contentAttr = metaTag.getAttribute('content');
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
        [filePath]: { width, height }
      }), {});
      setDimensions(newDimensions);

      setHtmlFiles(groupedFiles);
      } catch (error) {
      console.error("Error fetching HTML files:", error);
      setError("Failed to load HTML files");
      }
      };

      fetchHtmlFiles();
      }, []);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError("");
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result.split(",")[1]; // Remove data URL prefix
        const response = await fetch("/.netlify/functions/convert-psd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ psdBase64: base64, sessionId }),
        });
  
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        if (data.html) {
          const filename = data.filename;
          setConvertedHtml((prev) => ({ ...prev, [filename]: data.html }));
          setSelectedFiles((prev) => new Set([...prev, filename]));
          setHtmlContents((prev) => ({ ...prev, [filename]: data.html }));
        } else {
          throw new Error(data.error);
        }
      };
      reader.readAsDataURL(file);
      
      // Refresh the list of HTML files after conversion
      const fetchHtmlFiles = async () => {
        const response = await fetch("/api/list-html");
        const data = await response.json();
        const groupedFiles = data.reduce((acc, file) => {
          if (!acc[file.folder]) acc[file.folder] = [];
          acc[file.folder].push(file);
          return acc;
        }, {});
        setHtmlFiles(groupedFiles);
        const dimensionPromises = data.map(async (file) => {
          const filePath = file.url.replace("/api/html/", "");
          const contentResponse = await fetch(file.url);
          if (!contentResponse.ok) throw new Error(`Failed to fetch content for ${filePath}`);
          const content = await contentResponse.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');
          const metaTag = doc.querySelector('meta[name="ad.size"]');
          let width = "100%";
          let height = "300px";
          if (metaTag) {
            const contentAttr = metaTag.getAttribute('content');
            const widthMatch = contentAttr.match(/width=(\d+)/);
            const heightMatch = contentAttr.match(/height=(\d+)/);
            if (widthMatch) width = `${widthMatch[1]}px`;
            if (heightMatch) height = `${heightMatch[1]}px`;
          }
          return { filePath, width, height };
        });
        const dimensionsData = await Promise.all(dimensionPromises);
        const newDimensions = dimensionsData.reduce((acc, { filePath, width, height }) => ({
          ...acc,
          [filePath]: { width, height }
        }), {});
        setDimensions(newDimensions);
      };
      fetchHtmlFiles();
    } catch (error) {
      console.error("Error uploading file:", error);
      setError(`Failed to convert PSD: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1500px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>PSD to HTML Converter</h1>
      <div style={{ marginBottom: "20px" }}>
        <input
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          style={{ marginRight: "10px" }}
        />
        <button
          onClick={handleUpload}
          disabled={isLoading}
          style={{
            padding: "8px 16px",
            backgroundColor: isLoading ? "#ccc" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Converting..." : "Convert PSD"}
        </button>
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
      <div className="previewContent" style={{display: "flex", gap: "22px", flexWrap: "wrap"}}>
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
                      src={htmlFile.url}
                      style={{
                        width: dimensions[filePath]?.width || "100%",
                        height: dimensions[filePath]?.height || "300px",
                        border: "none"
                      }}
                      // loading="lazy"
                      title={`Preview of ${htmlFile.name}`}
                      sandbox="allow-same-origin allow-scripts"
                    />
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
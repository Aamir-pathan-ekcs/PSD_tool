"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [htmlFiles, setHtmlFiles] = useState({});

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

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first!");
      return;
    }

    setIsLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/convert-psd", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Unknown error");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "converted_html.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

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
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        PSD to HTML Converter
      </h1>
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
      </div>
      {error && <p style={{ color: "red", marginBottom: "20px" }}>{error}</p>}

      {/* Display HTML previews grouped by folder */}
      <h2 style={{ fontSize: "20px", marginTop: "20px" }}>Converted HTML Previews</h2>
      {Object.keys(htmlFiles).length > 0 ? (
        Object.keys(htmlFiles).map((folder) => (
          <div key={folder} style={{ marginBottom: "30px" }}>
            <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>{folder}</h3>
            <div style={{ display: "grid", gap: "20px" }}>
              {htmlFiles[folder].map((htmlFile, index) => (
                <div key={index} style={{ border: "1px solid #ccc", padding: "10px" }}>
                  <h4>{htmlFile.name}</h4>
                  <iframe
                    src={htmlFile.url}
                    style={{ width: "100%", height: "300px", border: "none" }}
                    title={`Preview of ${htmlFile.name}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p>No HTML files available. Convert a PSD to see previews.</p>
      )}
    </div>
  );
}
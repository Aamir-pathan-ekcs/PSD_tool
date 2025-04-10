"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function EditPage() {
  const [htmlContents, setHtmlContents] = useState({}); // Object to store content for each file
  const [selectedFiles, setSelectedFiles] = useState(new Set()); // Set to track selected file paths
  const [htmlFiles, setHtmlFiles] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Fetch HTML files on mount
  useEffect(() => {
    const fetchHtmlFiles = async () => {
      try {
        const response = await fetch("/api/list-html");
        if (!response.ok) throw new Error("Failed to fetch HTML files");
        const data = await response.json();
        const groupedFiles = data.reduce((acc, file) => {
          if (!acc[file.folder]) acc[file.folder] = [];
          acc[file.folder].push(file);
          return acc;
        }, {});
        setHtmlFiles(groupedFiles);

        // Pre-select file from URL query if provided
        const fileParam = searchParams.get("file");
        if (fileParam) {
          const filePaths = fileParam.split(",").filter(f => data.find(df => df.url === `/api/html/${f}`));
          if (filePaths.length > 0) {
            setSelectedFiles(new Set(filePaths));
            filePaths.forEach(async (filePath) => await fetchHtmlContent(`/api/html/${filePath}`));
          }
        }
      } catch (error) {
        console.error("Error fetching HTML files:", error);
        setError("Failed to load HTML files");
      }
    };

    fetchHtmlFiles();
  }, [searchParams]);

  // Fetch HTML content for a specific file
  const fetchHtmlContent = async (url) => {
    try {
      setIsLoading(true);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch HTML content");
      const content = await response.text();
      setHtmlContents(prev => ({ ...prev, [url.replace("/api/html/", "")]: content }));
      setError("");
    } catch (error) {
      console.error("Error fetching HTML content:", error);
      setError("Failed to load HTML content");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle checkbox selection
  const handleCheckboxChange = (e, filePath) => {
    const isChecked = e.target.checked;
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (isChecked) {
        newSet.add(filePath);
        fetchHtmlContent(`/api/html/${filePath}`);
      } else {
        newSet.delete(filePath);
      }
      // Update URL with the new set of selected files
      router.push(`/edit?file=${Array.from(newSet).join(",")}`);
      return newSet;
    });
  };

  // Save edited HTML for all selected files
  const handleSave = async () => {
    if (selectedFiles.size === 0) {
      setError("No files selected!");
      return;
    }

    setIsLoading(true);
    try {
      const savePromises = Array.from(selectedFiles).map(async (filePath) => {
        const response = await fetch("/api/save-html", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filename: filePath, content: htmlContents[filePath] || "" }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Failed to save ${filePath}`);
        }
      });

      await Promise.all(savePromises);
      setError("Files saved successfully!");
    } catch (error) {
      console.error("Error saving HTML:", error);
      setError(`Failed to save: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Flatten htmlFiles for checkbox list
  const flatFiles = Object.values(htmlFiles).flat();

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
                <button
          onClick={() => router.push("/")}
          style={{
            padding: "8px 16px",
            backgroundColor: "rgb(0 0 0)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Home page
        </button>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>Edit HTML</h1>
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>Select Files to Edit:</h3>
        {flatFiles.map((file) => {
          const filePath = file.url.replace("/api/html/", "");
          return (
            <div key={file.url} style={{ marginBottom: "5px" }}>
              <input
                type="checkbox"
                id={file.url}
                checked={selectedFiles.has(filePath)}
                onChange={(e) => handleCheckboxChange(e, filePath)}
                disabled={isLoading}
              />
              <label htmlFor={file.url} style={{ marginLeft: "5px" }}>
                {file.folder}/{file.name}
              </label>
            </div>
          );
        })}
        <button
          onClick={handleSave}
          disabled={isLoading || selectedFiles.size === 0}
          style={{
            padding: "8px 16px",
            backgroundColor: isLoading ? "#ccc" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            marginTop: "10px",
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Saving..." : "Save All"}
        </button>
      </div>
      {error && <p style={{ color: error.includes("successfully") ? "green" : "red", marginBottom: "20px" }}>{error}</p>}
      {Array.from(selectedFiles).map((filePath) => (
        <div key={filePath} style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>
            Editing: {filePath.split("/").pop()}
          </h3>
          <textarea
            value={htmlContents[filePath] || ""}
            onChange={(e) => setHtmlContents(prev => ({ ...prev, [filePath]: e.target.value }))}
            rows="10"
            cols="100"
            disabled={isLoading}
            style={{ width: "100%", padding: "10px", border: "1px solid #ccc", borderRadius: "4px" }}
            placeholder="Loading content..."
          />
        </div>
      ))}
      {selectedFiles.size === 0 && <p>Select at least one file to edit its content.</p>}
    </div>
  );
}
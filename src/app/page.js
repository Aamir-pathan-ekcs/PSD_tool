"use client";

import { useState, useEffect } from "react";
import { Container, Row, Col, Card, Button, Modal } from 'react-bootstrap';

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
  const [showModal, setShowModal] = useState(false);

  const handleShow = () => setShowModal(true);
  const handleClose = () => setShowModal(false);

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
    
    <div className="container">
      <div className="d-flex justify-content-center">
        <div className="card col-6 m-5 text-center">
          <div className="card-header">
            <h3>PSD to HTML Converter</h3>
          </div>
          <div className="card-body">
            <div>
              <input className="form-control" type="file" accept=".zip"
                onChange={handleFileChange}
                style={{ marginRight: "10px" }}
              />
              <button
                onClick={handleUpload}
                disabled={isLoading}
                className="btn btn-primary btn-block mt-3"
              >
                {isLoading ? "Converting..." : "Convert PSD"}
              </button>
            </div>
          </div>
          
          <button
                disabled={Object.keys(htmlFiles).length === 0}
                className="btn btn-secondary btn-block m-3" onClick={handleShow}
              >
                {Object.keys(htmlFiles).length > 0 ? "Preview All ads" : "Preview Not Generated"}
              </button>
          {error && <p style={{ color: "red", marginBottom: "20px" }}>{error}</p>}
        </div>
      </div>

      <Modal show={showModal} onHide={handleClose} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>HTML Previews</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          {Object.keys(htmlFiles).map((folder) => {
            const match = folder.match(/_(\d+)x(\d+)$/);
            const width = match ? parseInt(match[1], 10) : 300;
            const height = match ? parseInt(match[2], 10) : 300;

            return (
              <div key={folder} className="text-center mb-4">
                <h5 className="pb-2">{folder}</h5>
                  {htmlFiles[folder].map((htmlFile, index) => (
                          <iframe
                            src={htmlFile.url}
                            width={width}
                            height={height}
                            title={`Preview of ${htmlFile.name}`}
                          />
                  ))}
                
              </div>
            );
          })}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
      
    </div>
  );
}
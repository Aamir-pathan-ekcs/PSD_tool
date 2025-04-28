"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function EditPage() {
  const [htmlContents, setHtmlContents] = useState({}); // Object to store content for each file
  const [selectedFiles, setSelectedFiles] = useState(new Set()); // Set to track selected file paths
  const [htmlFiles, setHtmlFiles] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [animationKey, setAnimationKey] = useState(Date.now());
  const [fontLink, setFontLink] = useState("");
  const [dimensions, setDimensions] = useState({});

  const router = useRouter();
  const searchParams = useSearchParams();
  const mappingEmt = {
    'mainHeading-checkbox': 'sd_txta_Heading',
    'subHeading1-checkbox': 'sd_txta_Sub-Heading-1', 
    'subHeading2-checkbox': 'sd_txta_Sub-Heading-2', 
    'subHeading3-checkbox': 'sd_txta_Sub-Heading-3',
    'cta-checkbox': 'sd_btn_Click-Through-URL',
    'Image-1-checkbox': 'sd_img_Image-1',
    'Image-2-checkbox': 'sd_img_Image-2',
    'Image-3-checkbox': 'sd_img_Image-3'
  };
  const mappingEmtParent = {
    'mainHeading-checkboxParent': 'sd_txta_Heading',
    'subHeading1-checkboxParent': 'sd_txta_Sub-Heading-1', 
    'subHeading2-checkboxParent': 'sd_txta_Sub-Heading-2', 
    'subHeading3-checkboxParent': 'sd_txta_Sub-Heading-3',
    'cta-checkboxParent': 'sd_btn_Click-Through-URL',
    'Image-1-checkboxParent': 'sd_img_Image-1',
    'Image-2-checkboxParent': 'sd_img_Image-2',
    'Image-3-checkboxParent': 'sd_img_Image-3'
  };
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
    }, [searchParams, allCheckboxes, mappingEmt, mappingEmtParent, selectTarget, selectTargetParent]);


    
    function selectTarget(checkboxd, elementD) {
      const checkbox = document.getElementById(checkboxd);
      if (checkbox) {
        console.log('Calling 11111111111');
        const existingListener = checkbox._changeListener;
        if (existingListener) checkbox.removeEventListener('change', existingListener);
        checkbox._changeListener = () => {
          console.log('Calling 222222222222');
          if (checkbox.checked) {
            updateAnimationInContent(elementD, 'aiAnimation');
            const selector = document.getElementById('selectorAnimate');
            if (selector) {
              const animListener = selector._animationListener;
              if (animListener) selector.removeEventListener('change', animListener);
              selector._animationListener = () => {
                const selectedClass = selector.value;
                console.log(`Dropdown changed to ${selectedClass}`);
                if (selectedClass) {
                  console.log('Calling updateAnimationClass...');
                  updateAnimationClass(selector);
                  setAnimationKey(Date.now());
                }
              };
              selector.addEventListener('change', selector._animationListener);
            }
          } else {
            baseAnimaterRemove(elementD);
          }
        };
        checkbox.addEventListener('change', checkbox._changeListener);
      }
    }
    
    function allCheckboxes() {
      const allchecked = document.getElementById('all-checkbox');
      const checkboxes = document.querySelectorAll('.startContainer input[type="checkbox"]:not(#all-checkbox)');
      checkboxes.forEach(checkselected => {
        checkselected.checked = allchecked ? allchecked.checked : false;
        const checkboxId = checkselected.id;
        const targetEmt = mappingEmt[checkboxId];
        if (checkselected.checked) {
          selectTarget(checkboxId, targetEmt);
        } else {
          baseAnimaterRemove(targetEmt);
        }
      });
      for (let checkbox of checkboxes) {
        const elementTarget = mappingEmt[checkbox.id];
        if (allchecked.checked) {
          updateAnimationInContent(elementTarget, 'aiAnimation');
        } else {
          baseAnimaterRemove(elementTarget);
        }
      }
    }
    
    function baseAnimaterRemove(elementId) {
      updateAnimationInContent(elementId, null, 'aiAnimation'); // Explicitly remove aiAnimation
    }
    
    function updateAnimationInContent(elementId, newClass, removeClass = null) {
      Array.from(selectedFiles).forEach(filePath => {
        setHtmlContents(prev => {
          const content = prev[filePath] || '';
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');
          const targetElement = doc.getElementById(elementId);
          if (targetElement) {
            if (removeClass) targetElement.classList.remove(removeClass);
            if (newClass) {
              targetElement.classList.add(newClass);
              console.log(`Successfully added ${newClass} to ${elementId} in ${filePath}`);
            }
            console.log(`Element ${elementId} after update:`, targetElement.outerHTML);
          } else {
            console.warn(`Element ${elementId} not found in ${filePath}. Full content:`, content);
          }
          const newContent = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
          console.log(`Generated new content for ${filePath} (first 500 chars):`, newContent.substring(0, 500));
          return { ...prev, [filePath]: newContent };
        });
      });
    }

    function selectTargetParent(checkboxd, elementD) {
      const checkbox = document.getElementById(checkboxd);
      if (checkbox) {
        const existingListener = checkbox._changeListener;
        if (existingListener) checkbox.removeEventListener('change', existingListener);
        checkbox._changeListener = () => {
          if (checkbox.checked) {
            updateAnimationInContentParent(elementD, 'AiParentClass');
            const selector = document.getElementById('ParentSelectorAnimate'); 
            if (selector) {
              const animListener = selector._animationListener;
              if (animListener) selector.removeEventListener('change', animListener);
              selector._animationListener = () => {
                const selectedClass = selector.value;
                console.log(`Dropdown changed to ${selectedClass}`);
                if (selectedClass) {
                  console.log('Calling updateAnimationClass...');
                  updateAnimationClassParent(selector);
                  setAnimationKey(Date.now());
                }
              };
              selector.addEventListener('change', selector._animationListener);
            }

            // if(ParentSelectorAnimate) {
            //   const ParentanimListener = ParentSelectorAnimate._animationListenerParent;
            //   if (ParentanimListener) ParentSelectorAnimate.removeEventListener('change', ParentanimListener);
            //   ParentSelectorAnimate._animationListenerParent = () => {
            //     const selectedClassParent = ParentSelectorAnimate.value;
            //     console.log(`Dropdown changed to ${selectedClassParent}`);
            //     if (selectedClassParent) {
            //       console.log('Calling updateAnimationClass... pppppppppp');
            //       updateAnimationClass(ParentSelectorAnimate);
            //       setAnimationKey(Date.now());
            //     }
            //   };
            //   ParentSelectorAnimate.addEventListener('change', ParentSelectorAnimate._animationListenerParent);
            // }
          } else {
            baseAnimaterRemove(elementD);
          }
        };
        checkbox.addEventListener('change', checkbox._changeListener);
      }
    }

    function updateAnimationInContentParent(elementId, newClass, removeClass = null) {
      Array.from(selectedFiles).forEach(filePath => {
        setHtmlContents(prev => {
          const content = prev[filePath] || '';
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');
          const targetElement = doc.getElementById(elementId);
          if (targetElement) {
            if (removeClass) targetElement.classList.remove(removeClass);
            if (newClass) {
              const parentDiv = targetElement.parentElement
              if (parentDiv) {
                parentDiv.classList.add("AiParentClass");
                console.log(`Added ${newClass} to parent div of ${elementId}`);
              } else {
                console.warn(`No parent div found for ${elementId}`);
              }
              console.log(`Successfully added ${newClass} to ${elementId} in ${filePath}`);
            }
            console.log(`Element ${elementId} after update:`, targetElement.outerHTML);
          } else {
            console.warn(`Element ${elementId} not found in ${filePath}. Full content:`, content);
          }
          const newContent = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
          console.log(`Generated new content for ${filePath} (first 500 chars):`, newContent.substring(0, 500));
          return { ...prev, [filePath]: newContent };
        });
      });
    }
    

    let updateAnimationClassParent = (selector) => {
      const selectedClass = selector.value;
      const findingClass = 'delay_';
      if (!selectedClass) return;
      console.log(`Starting updateAnimationClass with ${selectedClass}`);
      console.log('Selected files before loop:', Array.from(selectedFiles));
      if (selectedFiles.size === 0) {
        console.warn('No files selected. Animation update skipped. Please select a file from the list.');
        return;
      }
      Array.from(selectedFiles).forEach(filePath => {
        console.log(`Processing file: ${filePath}`);
        setHtmlContents(prev => {
          const content = prev[filePath] || '';
          if (!content) {
            console.warn(`No content found for ${filePath}. Skipping update.`);
            return prev;
          }
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');
          const AIClasses = doc.querySelectorAll('.AiParentClass');
          console.log(`Found ${AIClasses.length} .AiParentClass elements in ${filePath}`);
          if (AIClasses.length === 0) {
            console.warn(`No .AiParentClass elements found in ${filePath}. Applying to all mapped elements. Content snippet:`, content.substring(0, 500));
            Object.values(mappingEmt).forEach(elementId => {
              const fallbackElement = doc.getElementById(elementId);
              fallbackElement = fallbackElement.parentElement;
              if (fallbackElement) {
                let classAnGot = null;
                for (let className of fallbackElement.classList) {
                  if (className.startsWith(findingClass)) {
                    classAnGot = className;
                  }
                }
                if (classAnGot) fallbackElement.classList.remove(classAnGot);
                if (!fallbackElement.classList.contains(selectedClass)) {
                  fallbackElement.classList.add(selectedClass);
                  console.log(`Applied ${selectedClass} as fallback to ${elementId} in ${filePath}`);
                } else {
                  console.log(`${selectedClass} already present on ${elementId} in ${filePath}`);
                }
              } else {
                console.warn(`Fallback element ${elementId} not found in ${filePath}`);
              }
            });
          } else {
            AIClasses.forEach(aiClass => {
              const classes = aiClass.classList;
              let classAnGot = null;
              for (let classNames of classes) {
                if (classNames.startsWith(findingClass)) {
                  classAnGot = classNames;
                }
              }
              if (classAnGot) {
                aiClass.classList.remove(classAnGot);
                console.log(`Removed existing animation ${classAnGot} from ${aiClass.id} in ${filePath}`);
              }
              if (!aiClass.classList.contains(selectedClass)) {
                aiClass.classList.add(selectedClass);
                aiClass.classList.remove('AiParentClass');
                console.log(`Applied ${selectedClass} to ${aiClass.id} in ${filePath}`);
              } else {
                console.log(`${selectedClass} already present on ${aiClass.id} in ${filePath}`);
              }
            });
          }
          const newContent = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
          console.log(`Updated iframe content for ${filePath} (first 500 chars):`, newContent.substring(0, 500));
          return { ...prev, [filePath]: newContent };
        });
      });
    };


    let updateAnimationClass = (selector) => {
      const selectedClass = selector.value;
      const findingClass = 'animate_';
      if (!selectedClass) return;
      console.log(`Starting updateAnimationClass with ${selectedClass}`);
      console.log('Selected files before loop:', Array.from(selectedFiles));
      if (selectedFiles.size === 0) {
        console.warn('No files selected. Animation update skipped. Please select a file from the list.');
        return;
      }
      Array.from(selectedFiles).forEach(filePath => {
        console.log(`Processing file: ${filePath}`);
        setHtmlContents(prev => {
          const content = prev[filePath] || '';
          if (!content) {
            console.warn(`No content found for ${filePath}. Skipping update.`);
            return prev;
          }
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');
          const AIClasses = doc.querySelectorAll('.aiAnimation');
          console.log(`Found ${AIClasses.length} .aiAnimation elements in ${filePath}`);
          if (AIClasses.length === 0) {
            console.warn(`No .aiAnimation elements found in ${filePath}. Applying to all mapped elements. Content snippet:`, content.substring(0, 500));
            Object.values(mappingEmt).forEach(elementId => {
              const fallbackElement = doc.getElementById(elementId);
              if (fallbackElement) {
                let classAnGot = null;
                for (let className of fallbackElement.classList) {
                  if (className.startsWith(findingClass)) {
                    classAnGot = className;
                  }
                }
                if (classAnGot) fallbackElement.classList.remove(classAnGot);
                if (!fallbackElement.classList.contains(selectedClass)) {
                  fallbackElement.classList.add(selectedClass);
                  console.log(`Applied ${selectedClass} as fallback to ${elementId} in ${filePath}`);
                } else {
                  console.log(`${selectedClass} already present on ${elementId} in ${filePath}`);
                }
              } else {
                console.warn(`Fallback element ${elementId} not found in ${filePath}`);
              }
            });
          } else {
            AIClasses.forEach(aiClass => {
              const classes = aiClass.classList;
              let classAnGot = null;
              for (let classNames of classes) {
                if (classNames.startsWith(findingClass)) {
                  classAnGot = classNames;
                }
              }
              if (classAnGot) {
                aiClass.classList.remove(classAnGot);
                console.log(`Removed existing animation ${classAnGot} from ${aiClass.id} in ${filePath}`);
              }
              if (!aiClass.classList.contains(selectedClass)) {
                aiClass.classList.add(selectedClass);
                aiClass.classList.remove('aiAnimation');
                console.log(`Applied ${selectedClass} to ${aiClass.id} in ${filePath}`);
              } else {
                console.log(`${selectedClass} already present on ${aiClass.id} in ${filePath}`);
              }
            });
          }
          const newContent = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
          console.log(`Updated iframe content for ${filePath} (first 500 chars):`, newContent.substring(0, 500));
          return { ...prev, [filePath]: newContent };
        });
      });
    };

    function updateFontLink(filePath, newLink) {
      setHtmlContents(prev => {
        const content = prev[filePath] || '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        const linkElement = doc.head.querySelector('link[href*="https://fonts.googleapis.com/css"]');
        if (linkElement) {
          if (newLink) {
            linkElement.setAttribute('href', newLink);
            console.log(`Updated font link to ${newLink} in ${filePath}`);
          } else {
            doc.head.removeChild(linkElement);
            console.log(`Removed font link from ${filePath}`);
          }
        } else if (newLink) {
          const newLinkElement = doc.createElement('link');
          newLinkElement.rel = 'stylesheet';
          newLinkElement.href = newLink;
          doc.head.appendChild(newLinkElement);
          console.log(`Added new font link ${newLink} to ${filePath}`);
        }
        
        const newContent = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
        console.log(`Generated new content for ${filePath} (first 500 chars):`, newContent.substring(0, 500));
        return { ...prev, [filePath]: newContent };
      });
      setAnimationKey(Date.now()); // Force iframe re-render
    }



  // Fetch HTML content for a specific file
  const fetchHtmlContent = async (url) => {
    try {
      setIsLoading(true);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch HTML content");
      const content = await response.text();
      setHtmlContents(prev => ({ ...prev, [url.replace("/api/html/", "")]: content }));
      const filePath = url.replace("/api/html/", "");
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const metaTag = doc.querySelector('meta[name="ad.size"]');
      let width = "100%";
      let height = "300px";
      if (metaTag) {
        const contentAtrr = metaTag.getAttribute('content');
        const widthMatch = contentAtrr.match(/width=(\d+)/);
        const heightMatch = contentAtrr.match(/height=(\d+)/);
        if (widthMatch) width = `${widthMatch[1]}px`;
        if (heightMatch) height = `${heightMatch[1]}px`;
      }
      setDimensions(prev => ({
        ...prev,
        [filePath] : {width, height}
      }));
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
      } else {
        newSet.delete(filePath);
      }
      return newSet;
    });
  };
  
  // Use effect for side effects
  useEffect(() => {
    const currentFiles = Array.from(selectedFiles);
    if (currentFiles.length > 0) {
      currentFiles.forEach(filePath => {
        if (!htmlContents[filePath]) {
          fetchHtmlContent(`/api/html/${filePath}`);
        }
      });
      router.push(`/edit?file=${currentFiles.join(",")}`);
    }
  }, [selectedFiles, htmlContents, router]);

  // Save edited HTML for all selected files
  const handleSave = async () => {
    if (selectedFiles.size === 0) {
      setError("No files selected!");
      return;
    }

    setIsLoading(true);
    try {
      const savePromises = Array.from(selectedFiles).map(async (filePath) => {
        alert(htmlContents[filePath]);
        const decodedFilename = decodeURIComponent(filePath);
        const response = await fetch("/api/save-html", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: filePath, content: htmlContents[filePath] || "" }),
        });
        if (!response.ok) {
          const text = await response.text();
          console.error(`Save failed for ${filePath}:`, text);
          throw new Error(`Failed to save ${filePath}: ${text}`);
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

  // Animation Management

  // Initialize selectTarget for all mapped elements
  useEffect(() => {
    const allchecked = document.getElementById('all-checkbox');
    const checkboxes = document.querySelectorAll('.startContainer input[type="checkbox"]:not(#all-checkbox)');
    const ParentCheckBoxes = document.querySelectorAll('.ParentStartContainer input[type="checkbox"]:not(#all-checkbox)');
  
    // Initialize selectTarget and event listeners
    Object.entries(mappingEmt).forEach(([checkboxId, elementId]) => selectTarget(checkboxId, elementId));
    Object.entries(mappingEmtParent).forEach(([checkboxId, elementId]) => selectTargetParent(checkboxId, elementId));
    if (allchecked) {
      allchecked.addEventListener('change', allCheckboxes);
    }
  
    // Cleanup event listeners
    return () => {
      if (allchecked) allchecked.removeEventListener('change', allCheckboxes);
      checkboxes.forEach(checkbox => {
        const listener = checkbox._changeListener;
        if (listener) checkbox.removeEventListener('change', listener);
      });
      ParentCheckBoxes.forEach(checkboxp => {
        const listenerp = checkboxp._changeListener;
        if (listenerp) checkboxp.removeEventListener('change', listenerp);
      });
      const selector = document.getElementById('selectorAnimate');
      if (selector) {
        const animListener = selector._animationListener;
        if (animListener) selector.removeEventListener('change', animListener);
      }
      const ParentSelector = document.getElementById('ParentSelectorAnimate');
      if (ParentSelector) {
        const animListener = ParentSelector._animationListener;
        if (animListener) ParentSelector.removeEventListener('change', animListener);
      }
    };
  }, [selectedFiles]); // Ensure reactivity with selectedFiles

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
        <div><br/></div>
        <div className="startContainer" style={{ marginTop: "10px" }}>
          <input
            type="checkbox"
            id="all-checkbox"
          />
          <label htmlFor="all-checkbox" style={{ marginLeft: "5px" }}>Select All</label>
          {Object.keys(mappingEmt).map(checkboxId => (
            <div key={checkboxId} style={{ marginBottom: "5px", display: "inline-block", marginLeft: "10px" }}>
              <input
                type="checkbox"
                id={checkboxId}
              />
              <label htmlFor={checkboxId} style={{ marginLeft: "5px" }}>
                {checkboxId.replace('-checkbox', '')}
              </label>
            </div>
          ))}
          <select id="selectorAnimate" style={{ marginLeft: "10px", padding: "5px" }}>
            <option value="">Select Animation</option>
            <option value="animate_fadeIn">Fade In</option>
            <option value="animate_fadeInUp">Fade In Up</option>
            <option value="animate_fadeInDown">Fade In Down</option>
            <option value="animate_fadeInLeft">Fade In Left</option>
            <option value="animate_fadeInRight">Fade In Right</option>
            <option value="animate_zoomIn">Zoom In</option>
            <option value="animate_zoomInZoomOut">Zoom In Zoom Out</option>
          </select>
          <br/>
        </div>
        <div className="ParentStartContainer" style={{ marginTop: "10px" }}>  
          {Object.keys(mappingEmt).map(checkboxIdParent => (
            <div key={checkboxIdParent} style={{ marginBottom: "5px", display: "inline-block", marginLeft: "10px" }}>
             
              <input
                type="checkbox"
                id={checkboxIdParent+"Parent"}
              />
              <label htmlFor={checkboxIdParent+"Parent"} style={{ marginLeft: "5px" }}>Parent Element -
                {checkboxIdParent.replace('-checkbox', '')}
              </label>
            </div>
          ))}
          <select id="ParentSelectorAnimate" style={{ marginLeft: "10px", padding: "5px" }}>
            <option value="">Parent Animation</option>
            <option value="delay_0s">delay 0s</option>
            <option value="delay_0_5s"> delay 0.5s</option>
            <option value="delay_1s"> delay 1s</option>
            <option value="delay_1_5s"> delay 1.5s</option>
            <option value="delay_2s"> delay 2s</option>
            <option value="delay_2_5s"> delay 2.5s</option>
            <option value="delay_3s"> delay 3s</option>
            <option value="delay_3_5s"> delay 3.5s</option>
            <option value="delay_4s"> delay 4s</option>
            <option value="delay_4_5s"> delay 4.5s</option>
            <option value="delay_5s"> delay 5s</option>
            <option value="delay_5_5s"> delay 5.5s</option>
            <option value="delay_6s"> delay 6s</option>
            <option value="delay_6_5s"> delay 6.5s</option>
            <option value="delay_7s"> delay 7s</option>
            <option value="delay_7_5s"> delay 7.5s</option>
            <option value="delay_8s"> delay 8s</option>
            <option value="delay_8_5s"> delay 8.5s</option>
            <option value="delay_9s"> delay 9s</option>
            <option value="delay_9_5s"> delay 9.5s</option>
            <option value="delay_10s"> delay 10s</option>
            <option value="delay_10_5s"> delay 10.5s</option>
            <option value="delay_11s"> delay 11s</option>
            <option value="delay_11_5s"> delay 11.5s</option>
            <option value="delay_12s"> delay 12s</option>
            <option value="delay_12_5s"> delay 12.5s</option>
            <option value="delay_13s"> delay 13s</option>
            <option value="delay_13_5s"> delay 13.5s</option>
            <option value="delay_14s"> delay 14s</option>
            <option value="delay_14_5s"> delay 14.5s</option>
            <option value="delay_15s"> delay 15s</option>
            <option value="delay_15_5s"> delay 15.5s</option>
          </select>
          <input 
            type="text" 
            value={fontLink} 
            onChange={(e) => setFontLink(e.target.value)} 
            placeholder="Enter font Link (e.g, https://fonts.googleapis.com/css2?family=Roboto))"
              style={{marginLeft: "10px", padding: "5px"}}
            />
            <button 
             onClick={ ()=>Array.from(selectedFiles).forEach(filePath => updateFontLink(filePath, fontLink || ""))}
              style={{ marginLeft: "10px", padding: "5px" }}>
              Update URL
            </button>
        </div>
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
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        {Array.from(selectedFiles).map((filePath) => (
          // console.log("sasasa"+filePath.split("/").pop()),
          <div key={filePath} style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "18px", marginBottom: "10px" }}>
              Editing: {filePath.split("/").pop()}
            </h3>
            {/* <textarea
              value={htmlContents[filePath] || ""}
              onChange={(e) => setHtmlContents(prev => ({ ...prev, [filePath]: e.target.value }))}
              rows="10"
              cols="100"
              disabled={isLoading}
              style={{ width: "100", padding: "10px", border: "1px solid #ccc", borderRadius: "4px" }}
              placeholder="Loading content..."
            /> */}
            <h4 style={{ fontSize: "16px", marginTop: "10px" }}>Preview Banner:</h4>
            <iframe
              key={`${filePath}-${animationKey}`} // Unique key to force re-render on animation change
              srcDoc={htmlContents[filePath] || ""}
              style={{ width: dimensions[filePath]?.width || "100%",
                height: dimensions[filePath]?.height || "300px", border: "1px solid #ccc", borderRadius: "4px", marginTop: "5px" }}
              title={`Preview of ${filePath.split("/").pop()}`}
              sandbox="allow-same-origin allow-scripts"
              onLoad={(e) => console.log(`Iframe loaded for ${filePath} with content snippet:`, htmlContents[filePath]?.substring(0, 500) || 'No content')}
            />
          </div>
        ))}
        {selectedFiles.size === 0 && <p>Select at least one file to edit its content.</p>}
      </div>
    </div>
  );
}
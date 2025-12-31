

import React, { useState } from 'react';
import FileUploader from './FileUploader';

const PACKAGES = {
  teststarter: { title: 'Test Starter Package', limit: 1, description: 'Please upload 1 test image.', column: 'Image_Upload' },
  teststandard: { title: 'Test Standard Package', limit: 1, description: 'Please upload 1 test image.', column: 'Image_Upload' },
  starter: { title: 'Starter Package', limit: 4, description: 'Please upload 4 images.', column: 'Image_Upload2' },
  standard: { title: 'Standard Package', limit: 8, description: 'Please upload 8 images.', column: 'Image_Upload2' },
  default: { title: 'Image Upload', limit: 10, description: 'Please upload your images.', column: 'Image_Upload2' }
};

function App() {
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [files, setFiles] = useState([]);
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // State for AI generation selection (kept from original code)
  const [selectedImageIndex, setSelectedImageIndex] = useState("");

  // Get package from URL query parameter
  const queryParams = new URLSearchParams(window.location.search);
  const packageType = queryParams.get('package');
  const currentPackage = PACKAGES[packageType] || PACKAGES.default;

  // Helper function to correct image orientation
  const correctImageOrientation = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // Set canvas size to image size
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw image with correct orientation
          ctx.drawImage(img, 0, 0);

          // Convert canvas to blob
          canvas.toBlob((blob) => {
            // Create new file with corrected orientation
            const correctedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(correctedFile);
          }, file.type);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Handler for the Drag and Drop component
  const handleFilesSelected = async (incomingFiles) => {
    if (incomingFiles.length > currentPackage.limit) {
      alert(`You can only upload a maximum of ${currentPackage.limit} images for the ${currentPackage.title}.`);
      setFiles([]); // Reset
    } else {
      setIsLoading(true); // Show loading state while processing
      try {
        // Correct orientation for all images
        const correctedFiles = await Promise.all(
          incomingFiles.map(file => correctImageOrientation(file))
        );
        setFiles(correctedFiles);
      } catch (error) {
        console.error("Error processing images:", error);
        alert("There was an error processing your images.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      alert("Please select files first.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('uploadColumn', currentPackage.column); // Send target column
      formData.append('prompt', prompt); // Add prompt text
      formData.append('orderPackage', packageType || 'default'); // Add package type

      files.forEach((file) => {
        formData.append('images', file);
      });

      const response = await fetch('/upload_images', {
        method: 'POST',
        body: formData, // Send FormData directly
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          alert(result.error);
          return;
        }
        throw new Error(result.error || "Upload failed");
      }

      console.log("✅ Uploaded to Airtable:", result);
      alert("Upload successful!");
      
      // Clear form on success
      setFiles([]);
      setPrompt('');

    } catch (error) {
      console.error("❌ Error uploading to Airtable:", error);
      alert(error.message || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const generateImage = async () => {
    setIsLoading(true);
    try {
      const selectedFile = selectedImageIndex !== "" ? files[selectedImageIndex] : null;

      let body;
      let headers = {};

      if (selectedFile) {
        const formData = new FormData();
        formData.append('prompt', prompt); 
        formData.append('image', selectedFile);
        formData.append('user', 'User123');
        body = formData;
      } else {
        body = JSON.stringify({
          prompt,
          user: 'User123',
        });
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch('/ai', {
        method: 'POST',
        headers: headers,
        body: body,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const imageUrl = data.data?.[0]?.url;
      console.log("OpenAI Response:", data);

      setResult(imageUrl);

      if (!imageUrl) throw new Error("Image URL missing in OpenAI response");

      // Save to Airtable
      await saveToAirtable(prompt, imageUrl, 'User123', email, files, currentPackage.column);

    } catch (error) {
      console.error("Error generating image:", error);
      alert(`Error generating image: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };


  const saveToAirtable = async (prompt, imageUrl, user = 'Anonymous', email = '', files = [], uploadColumn = 'Image_Upload2') => {
    console.log("📦 Saving to Airtable:", { prompt, imageUrl, user, email, files, uploadColumn });
    try {
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('imageUrl', imageUrl);
      formData.append('user', user);
      formData.append('email', email);
      formData.append('uploadColumn', uploadColumn); // Send target column

      files.forEach((file) => {
        formData.append('images', file);
      });

      const response = await fetch('/airtable', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      console.log("✅ Saved to Airtable:", result);
    } catch (error) {
      console.error("❌ Error saving to Airtable:", error);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial', maxWidth: '600px', margin: '0 auto' }}>
      <h1>{currentPackage.title}</h1>
      <p>{currentPackage.description}</p>

      <div style={{ marginBottom: '2rem', border: '1px solid #ccc', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Name</label>
          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ padding: '0.75rem', width: '100%', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Email</label>
          <input
            type="email"
            placeholder="Your Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ padding: '0.75rem', width: '100%', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Upload Images</label>
          {/* Drag and Drop Component */}
          <FileUploader 
            onFilesSelected={handleFilesSelected}
            maxFiles={currentPackage.limit}
            disabled={isUploading || isLoading}
            description={`Supported formats: JPG, PNG. Limit: ${currentPackage.limit}`}
          />

          {/* Selected Files List Preview */}
          {files.length > 0 && (
            <div style={{ marginTop: '0.5rem', backgroundColor: '#f9f9f9', padding: '0.5rem', borderRadius: '4px', border: '1px solid #eee' }}>
              <strong style={{ fontSize: '0.9rem', color: '#333' }}>Selected ({files.length}):</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '20px', color: '#555' }}>
                {files.map((file, index) => (
                  <li key={index} style={{ fontSize: '0.85rem' }}>
                    {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Notes (Optional)</label>
          <textarea
            placeholder="Add notes or information about your images..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            style={{
              padding: '0.75rem',
              width: '100%',
              minHeight: '80px',
              display: 'block',
              fontFamily: 'Arial, sans-serif',
              fontSize: '14px',
              resize: 'vertical',
              boxSizing: 'border-box',
              borderRadius: '4px',
              border: '1px solid #ccc'
            }}
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={isUploading || isLoading || files.length === 0}
          style={{ 
            padding: '0.75rem 1rem', 
            width: '100%',
            backgroundColor: (isUploading || isLoading || files.length === 0) ? '#cccccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (isUploading || isLoading || files.length === 0) ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem'
          }}
        >
          {isUploading ? 'Uploading...' : 'Upload Package'}
        </button>

      </div>
    </div>
  );
}

export default App;

import React, { useState } from 'react';


const PACKAGES = {
  test: { title: 'Test Package', limit: 2, description: 'Please upload 2 test images.', column: 'Image_Upload' },
  starter: { title: 'Starter Package', limit: 3, description: 'Please upload 3 images.', column: 'Image_Upload2' },
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

  // Get package from URL query parameter
  const queryParams = new URLSearchParams(window.location.search);
  const packageType = queryParams.get('package');
  const currentPackage = PACKAGES[packageType] || PACKAGES.default;

  const [selectedImageIndex, setSelectedImageIndex] = useState("");

  const handleFileChange = (e) => {
    const selectedFiles = [...e.target.files];
    if (selectedFiles.length > currentPackage.limit) {
      alert(`You can only upload a maximum of ${currentPackage.limit} images for the ${currentPackage.title}.`);
      // Reset the input value so the user can try again
      e.target.value = '';
      setFiles([]);
    } else {
      setFiles(selectedFiles);
    }
  };

  const handleUpload = async () => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('uploadColumn', currentPackage.column); // Send target column
      formData.append('prompt', prompt); // Add prompt text

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
        formData.append('prompt', prompt); // Sent but ignored by backend for variations
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
    <div style={{ padding: '2rem', fontFamily: 'Arial' }}>
      <h1>{currentPackage.title}</h1>
      <p>{currentPackage.description}</p>

      <div style={{ marginBottom: '2rem', border: '1px solid #ccc', padding: '1rem' }}>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ padding: '0.5rem', width: '300px', display: 'block', marginBottom: '0.5rem' }}
        />
        <input
          type="email"
          placeholder="Your Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ padding: '0.5rem', width: '300px', display: 'block', marginBottom: '0.5rem' }}
        />
        <input
          type="file"
          multiple
          onChange={handleFileChange}
          style={{ padding: '0.5rem', display: 'block', marginBottom: '0.5rem' }}
        />
        <button
          onClick={handleUpload}
          disabled={isUploading}
          style={{ padding: '0.5rem 1rem', marginTop: '0.5rem' }}
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>

        <input
          type="text"
          placeholder="Add notes or information about your images (optional)"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          style={{ padding: '0.5rem', width: '300px', display: 'block', marginTop: '0.5rem' }}
        />



      </div>

      {/** AI image gneration starts here */}

      {/** 

      <hr style={{ margin: '2rem 0' }} />

      <h1>Generate or Modify Image with AI</h1>

      {files.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select an image to create a variation (optional):</label>
          <select
            onChange={(e) => setSelectedImageIndex(e.target.value)}
            value={selectedImageIndex}
            id="imageSelector"
            style={{ padding: '0.5rem', width: '300px' }}
          >
            <option value="">-- Create new image (No file) --</option>
            {files.map((file, index) => (
              <option key={index} value={index}>
                {file.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '0.8rem', color: '#666' }}>
            * Selecting an image will ignore the prompt and generate a variation.
          </p>
        </div>
      )}

      <input
        type="text"
        placeholder="Enter your prompt (ignored if image selected)"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        disabled={selectedImageIndex !== ""}
        style={{ padding: '0.5rem', width: '300px', backgroundColor: selectedImageIndex !== "" ? '#f0f0f0' : 'white' }}
      />
      <button
        onClick={generateImage}
        disabled={isLoading}
        style={{ marginLeft: '1rem', padding: '0.5rem 1rem' }}
      >

        {isLoading ? 'Processing...' : 'Generate / Variation'}
      </button>

      {result && (
        <div style={{ marginTop: '2rem' }}>
          <img src={result} alt="Generated" style={{ maxWidth: '100%', height: 'auto' }} />
        </div>
      )}
 */}
    </div>
  );
}

export default App;
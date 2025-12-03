
// functions/ai.js

export async function onRequest({ request, env }) {
  // ✅ CORS Preflight Handling
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // ✅ Only accept POST
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const contentType = request.headers.get("Content-Type") || "";
    let prompt = "";
    let imageFile = null;

    // Handle both JSON and FormData
    if (contentType.includes("application/json")) {
      const body = await request.json();
      prompt = body.prompt;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      prompt = formData.get("prompt");
      imageFile = formData.get("image");
    }

    if (!prompt && !imageFile) {
      return new Response(
        JSON.stringify({ error: "Missing 'prompt' or 'image'" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let finalPrompt = prompt;

    // ✅ If an image is provided, use the Image Variations API
    if (imageFile) {
      console.log("🖼️ Image received. Generating variations (ignoring prompt)...");

      const openAIFormData = new FormData();
      openAIFormData.append("image", imageFile);
      openAIFormData.append("n", "1");
      openAIFormData.append("size", "1024x1024");
      const apiResponse = await fetch("https://api.openai.com/v1/images/variations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.VITE_APP_OPENAI_API_KEY}`,
          // Content-Type is automatically set by fetch for FormData
        },
        body: openAIFormData,
      });

      const data = await apiResponse.json();

      if (data.error) {
        throw new Error(`OpenAI Variations Error: ${data.error.message}`);
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    console.log("🎨 Generating image with prompt:", finalPrompt);

    // ✅ Generate image using OpenAI API (DALL-E 3) for text-only requests
    const apiResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.VITE_APP_OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024",
      }),
    });

    const data = await apiResponse.json();

    if (data.error) {
      throw new Error(`DALL-E 3 Error: ${data.error.message}`);
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // ✅ CORS
      },
    });
  } catch (error) {
    console.error("❌ Error in /ai function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

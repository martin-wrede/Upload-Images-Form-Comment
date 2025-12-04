
export async function onRequest({ request, env }) {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }

    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        console.log("Received upload request");
        const formData = await request.formData();
        const name = formData.get('name');
        const email = formData.get('email');
        const uploadColumn = formData.get('uploadColumn') || 'Image_Upload2'; // Default to Image_Upload2
        const prompt = formData.get('prompt') || ''; // Get prompt text
        const orderPackage = formData.get('orderPackage'); // Get package type
        const files = formData.getAll('images');

        const airtableUrl = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_NAME}`;
        let pendingRecordId = null;

        // Check for pending record (Test uploaded, Paid empty)
        if (email) {
            // New Logic: Fetch last 10 records for this email and check in JS
            const filterFormula = `{Email} = '${email}'`;
            const encodedFormula = encodeURIComponent(filterFormula);
            const checkUrl = `${airtableUrl}?filterByFormula=${encodedFormula}&maxRecords=10&sort%5B0%5D%5Bfield%5D=Created&sort%5B0%5D%5Bdirection%5D=desc`;

            console.log("Checking for pending record with URL:", checkUrl);

            try {
                const checkRes = await fetch(checkUrl, {
                    headers: { 'Authorization': `Bearer ${env.AIRTABLE_API_KEY}` }
                });
                const checkData = await checkRes.json();
                console.log("Records found for email:", checkData.records ? checkData.records.length : 0);

                if (checkData.records && checkData.records.length > 0) {
                    // Find a record where Image_Upload has items AND Image_Upload2 is empty
                    const pendingRecord = checkData.records.find(record => {
                        const hasTestImages = record.fields.Image_Upload && record.fields.Image_Upload.length > 0;
                        const hasPaidImages = record.fields.Image_Upload2 && record.fields.Image_Upload2.length > 0;
                        return hasTestImages && !hasPaidImages;
                    });

                    if (pendingRecord) {
                        pendingRecordId = pendingRecord.id;
                        console.log("Found pending record ID via JS check:", pendingRecordId);
                    } else {
                        console.log("No pending record found via JS check.");
                    }
                }
            } catch (error) {
                console.error("Error checking for pending record:", error);
            }
        }

        // Logic: Block Test if pending exists
        if (uploadColumn === 'Image_Upload' && pendingRecordId) {
            return new Response(JSON.stringify({
                error: "You have a pending test package. Please upload your final images to complete the cycle."
            }), {
                status: 403,
                headers: { "Content-Type": "application/json" }
            });
        }

        const timestamp = new Date().toISOString();
        const uploadedImageUrls = [];

        // Upload files to R2
        if (files && files.length > 0) {
            for (const file of files) {
                if (file instanceof File) {
                    // Sanitize email: replace non-alphanumeric characters with underscores
                    const safeEmail = email ? email.replace(/[^a-zA-Z0-9]/g, '_') : 'anonymous';
                    // Create folder structure: email_folder/timestamp_filename.jpg
                    const key = `${safeEmail}/${Date.now()}_${file.name}`;

                    await env.IMAGE_BUCKET.put(key, file.stream());
                    const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;
                    uploadedImageUrls.push({ url: publicUrl });
                }
            }
        }

        console.log("Uploaded image URLs:", JSON.stringify(uploadedImageUrls, null, 2));

        const fields = {
            User: name || 'Anonymous',
            Timestamp: timestamp
        };

        if (email) {
            fields.Email = email;
        }

        if (orderPackage) {
            fields.Order_Package = orderPackage;
        }

        if (prompt) {
            fields.Prompt = prompt; // Add prompt text to Airtable
        }

        if (uploadedImageUrls.length > 0) {
            fields[uploadColumn] = uploadedImageUrls;
        }

        console.log("Saving upload to Airtable with fields:", JSON.stringify(fields, null, 2));

        // Logic: Update if Paid and pending exists
        let finalUrl = airtableUrl;
        let method = 'POST';

        if (uploadColumn === 'Image_Upload2' && pendingRecordId) {
            finalUrl = `${airtableUrl}/${pendingRecordId}`;
            method = 'PATCH';
            console.log(`Updating pending record ${pendingRecordId}`);
        }

        const airtableRes = await fetch(finalUrl, {
            method: method,
            headers: {
                'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fields })
        });

        const responseBody = await airtableRes.text();
        console.log("Airtable Response Status:", airtableRes.status);
        console.log("Airtable Response Body:", responseBody);

        let data;
        try {
            data = JSON.parse(responseBody);
        } catch (e) {
            data = { error: "Failed to parse Airtable response", body: responseBody };
        }

        if (!airtableRes.ok) {
            console.error("Airtable API Error:", data);
            const errorMessage = data.error?.message || "Unknown Airtable Error";
            const errorType = data.error?.type || "UNKNOWN_TYPE";
            return new Response(JSON.stringify({
                error: errorMessage,
                type: errorType,
                details: data
            }), {
                status: airtableRes.status,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Send email notification
        try {
            if (env.RESEND_API_KEY) {
                const packageDisplayName = orderPackage || 'default';
                const emailSubject = `New Upload: ${packageDisplayName}`;
                const emailBody = `
                    <h2>New Image Upload Notification</h2>
                    <p><strong>Package Type:</strong> ${packageDisplayName}</p>
                    <p><strong>User Name:</strong> ${name || 'Anonymous'}</p>
                    <p><strong>User Email:</strong> ${email || 'Not provided'}</p>
                    <p><strong>Number of Images:</strong> ${uploadedImageUrls.length}</p>
                    <p><strong>Upload Column:</strong> ${uploadColumn}</p>
                    <p><strong>Timestamp:</strong> ${timestamp}</p>
                    ${prompt ? `<p><strong>Notes:</strong> ${prompt}</p>` : ''}
                    <p><strong>Action:</strong> ${method === 'PATCH' ? 'Updated existing record' : 'Created new record'}</p>
                `;

                const emailRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: 'Upload Notifications <onboarding@resend.dev>',
                        to: ['info@targetx.de'],
                        subject: emailSubject,
                        html: emailBody,
                    }),
                });

                if (emailRes.ok) {
                    console.log("✅ Email notification sent successfully");
                } else {
                    const emailError = await emailRes.text();
                    console.error("❌ Failed to send email notification:", emailError);
                }
            } else {
                console.log("⚠️ RESEND_API_KEY not configured, skipping email notification");
            }
        } catch (emailError) {
            console.error("❌ Error sending email notification:", emailError);
            // Don't fail the upload if email fails
        }

        return new Response(JSON.stringify(data), {
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    }
}

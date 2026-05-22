import { HFModelDetails, HuggingFaceModel } from "../types/models";

export const getDownloadUrlForModel = async (modelId: string): Promise<{ url: string; filename: string } | null> => {
    try {
        // 1. Fetch the full details for the clicked model repository
        let response = await fetch(`https://huggingface.co/api/models/${modelId}`);

        if (!response.ok) throw new Error("Failed to fetch model details");

        let data: HFModelDetails = await response.json();
        let currentModelId = modelId;

        // 2. Extract and filter out only the .gguf files
        let ggufFiles = data.siblings
            ? data.siblings.map((s) => s.rfilename).filter((name) => name.endsWith(".gguf"))
            : [];

        // 🚀 FALLBACK LOGIC: If no GGUF files exist in this repo, find a GGUF clone!
        if (ggufFiles.length === 0) {
            console.log(`No GGUF files found in base repo ${modelId}. Searching for community GGUF clones...`);

            // Extract the base model name (e.g., "Meta-Llama-3-8B-Instruct" from "meta-llama/Meta-Llama-3-8B-Instruct")
            const baseModelName = modelId.split("/").pop();

            // Query the Hugging Face API for repositories matching the model name + "gguf"
            const searchResponse = await fetch(
                `https://huggingface.co/api/models?search=${baseModelName}+gguf&limit=5&sort=downloads&direction=-1`
            );

            if (searchResponse.ok) {
                const searchResults = await searchResponse.json();

                // If we found alternative GGUF repositories, look inside the most popular one
                if (searchResults && searchResults.length > 0) {
                    const fallbackModelId = searchResults[0].id;
                    console.log(`Found fallback GGUF repository: ${fallbackModelId}`);

                    // Fetch details for the fallback community GGUF repo
                    const fallbackDetailsResponse = await fetch(`https://huggingface.co/api/models/${fallbackModelId}`);

                    if (fallbackDetailsResponse.ok) {
                        const fallbackData: HFModelDetails = await fallbackDetailsResponse.json();

                        // Update our tracking variables with the fallback repository data
                        ggufFiles = fallbackData.siblings
                            ? fallbackData.siblings.map((s) => s.rfilename).filter((name) => name.endsWith(".gguf"))
                            : [];

                        currentModelId = fallbackModelId;
                    }
                }
            }
        }

        // If even the fallback search couldn't find a GGUF version, exit gracefully
        if (ggufFiles.length === 0) {
            console.warn("No GGUF files found in the base repo or community clones.");
            return null;
        }

        // 3. Auto-select the best mobile quantization (Q4_K_M) if it exists, otherwise grab the first one
        let targetFilename = ggufFiles.find((name) => name.toLowerCase().includes("q4_k_m")) || ggufFiles[0];

        // 🚀 FIX HERE: Strip out any folder paths right now so the UI component never receives them!
        // This changes "prompt_enhancer/mmproj-BF16.gguf" -> "mmproj-BF16.gguf"
        const safeCleanedFilename = targetFilename.split("/").pop() || "model.gguf";

        // 4. Construct the raw download URL using the resolved model ID (keep targetFilename here for the URL path!)
        const downloadUrl = `https://huggingface.co/${currentModelId}/resolve/main/${targetFilename}`;

        console.log("Resolved Download Target:", {
            url: downloadUrl,
            filename: safeCleanedFilename,
        });

        return {
            url: downloadUrl,
            filename: safeCleanedFilename, // Returning the safe, folder-free filename
        };
    } catch (error) {
        console.error("Error fetching file list:", error);
        return null;
    }
};

// const fetchOnlyQ4Models = async () => {
//   // Using 'gguf+q4' filters the initial repository list down significantly
//   const url = 'https://huggingface.co/api/models?search=gguf+q4&limit=2000&sort=downloads&direction=-1&expand=pipeline_tag&expand=siblings';

//   try {
//     const response = await fetch(url);
//     const rawModels = await response.json();

//     const q4ModelsOnly = rawModels.map((model: HuggingFaceModel) => {
//       const modelType = model.pipeline_tag || 'text-generation';
//       const baseParamCount = model.gguf?.total || 1000000000;

//       // Filter siblings locally in JavaScript (highly performant)
//       const q4Files = (model.siblings || [])
//         .filter(file => {
//           const filename = file.rfilename.toLowerCase();
//           // Matches standard Q4 variants: .q4_0.gguf, _q4_k_m.gguf, _q4_1.gguf, etc.
//           return filename.endsWith('.gguf') && filename.includes('q4');
//         })
//         .map(file => {
//           // Calculate dynamic size approximations since 'siblings' doesn't provide size here
//           // Q4 quantizations average roughly 4.5 bits per parameter
//           const estimatedFileBytes = (baseParamCount * 4.5) / 8;
//           const sizeGB = estimatedFileBytes / (1024 * 1024 * 1024);

//           // RAM rule of thumb for llama.rn: file size + ~1.5GB context/system overhead
//           const estRamGB = sizeGB + 1.5;

//           return {
//             fileName: file.rfilename,
//             estimatedDownloadSize: `${sizeGB.toFixed(2)} GB`,
//             estimatedRamRequired: `${estRamGB.toFixed(2)} GB`
//           };
//         });

//       return {
//         repoId: model.id,
//         type: modelType,
//         downloads: model.downloads || 0,
//         contextLength: model.gguf?.context_length || 2048,
//         files: q4Files
//       };
//     }).filter(model => model.files.length > 0); // Drop any repos that didn't have a matching Q4 file

//     return q4ModelsOnly;

//   } catch (error) {
//     console.error('Error fetching Q4 GGUF models:', error);
//   }
// };

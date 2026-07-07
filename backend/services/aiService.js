const fetch = globalThis.fetch;
const prompts = require('./prompts');

// Helper to handle common JSON extraction (in case models wrap JSON in markdown blocks)
function extractJsonFromText(text) {
  try {
    // If it's already clean JSON
    return JSON.parse(text);
  } catch (e) {
    // Try to extract from markdown blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (err) {
        console.error("Failed to parse extracted JSON block:", err);
      }
    }
  }
  return null;
}

// Core execution engine - Configured to use Groq directly

async function executeConsensus(systemPrompt, userPrompt, rationalizeTask) {
  let finalJson = null;
  let attempt = 0;
  
  const useGemini = false; // Set to false to switch back to Groq
  
  if (useGemini) {
    const combinedPrompt = prompts.getConsensusCombinedPrompt(systemPrompt, userPrompt, rationalizeTask);
    const systemPromptToUse = systemPrompt || prompts.getConsensusSystemPrompt();
    const fullTextPrompt = `${systemPromptToUse}\n\n${combinedPrompt}`;
    
    while (attempt < 4) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: fullTextPrompt }]
            }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json"
            }
          })
        });
        
        const data = await response.json();
        if (data.error) {
          console.error(`Gemini API Error (Attempt ${attempt + 1}):`, data.error.message || data.error);
          const errMsg = (data.error.message || "").toLowerCase();
          if (errMsg.includes("quota") || errMsg.includes("rate limit") || errMsg.includes("limit exceeded")) {
            console.log("Gemini free-tier quota/rate limit reached. Sleeping 60s to reset window...");
            await new Promise(r => setTimeout(r, 60000));
          }
        } else if (data.candidates && data.candidates.length > 0) {
          const text = data.candidates[0].content.parts[0].text;
          finalJson = extractJsonFromText(text) || JSON.parse(text);
          if (finalJson) break;
        }
      } catch (e) {
        console.error(`Gemini attempt ${attempt + 1} failed:`, e.message);
      }
      
      if (attempt < 3) {
        const backoff = 2000 * Math.pow(2, attempt);
        console.log(`Retrying Gemini in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
      }
      attempt++;
    }
    return { finalJson, rawOutputs: [] };
  }
  
  // Combine all context directly for Groq
  const combinedPrompt = prompts.getConsensusCombinedPrompt(systemPrompt, userPrompt, rationalizeTask);
  
  while (attempt < 4) { // Give it 4 attempts to beat the rate limit
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: prompts.getConsensusSystemPrompt() },
            { role: 'user', content: combinedPrompt }
          ],
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: 'json_object' }
        })
      });
      
      const data = await response.json();
      if (data.error) {
        console.error(`Groq API Error (Attempt ${attempt + 1}):`, data.error.message);
      } else if (data.choices && data.choices.length > 0) {
        const text = data.choices[0].message.content;
        finalJson = extractJsonFromText(text) || JSON.parse(text);
        if (finalJson) break;
      }
    } catch (e) {
      console.error(`Groq attempt ${attempt + 1} failed:`, e.message);
    }
    
    if (attempt < 3) {
      const backoff = 6000 * Math.pow(2, attempt); // 6s, 12s, 24s
      console.log(`Retrying Groq in ${backoff}ms to bypass rate limits...`);
      await new Promise(r => setTimeout(r, backoff));
    }
    attempt++;
  }

  return { finalJson, rawOutputs: [] };
}

// Public Methods

async function parseResumeMultiLLM(cleanedText, requestedFields) {
  const systemPrompt = prompts.resumeParsing.getSystemPrompt();
  const userPrompt = prompts.resumeParsing.getUserPrompt(cleanedText, requestedFields);
  const rationalizeTask = prompts.resumeParsing.getRationalizeTask();

  const result = await executeConsensus(systemPrompt, userPrompt, rationalizeTask);
  return result.finalJson;
}

async function parseJobDescriptionMultiLLM(cleanedText) {
  const systemPrompt = prompts.jdParsing.getSystemPrompt();
  const userPrompt = prompts.jdParsing.getUserPrompt(cleanedText);
  const rationalizeTask = prompts.jdParsing.getRationalizeTask();

  const result = await executeConsensus(systemPrompt, userPrompt, rationalizeTask);
  return result.finalJson;
}

async function scoreCandidateMultiLLM(candidateSummary, jobSummary, backendMetrics) {
  const candidateSummaryJSON = JSON.stringify(candidateSummary, null, 2);
  const jobSummaryJSON = JSON.stringify(jobSummary, null, 2);
  const backendMetricsJSON = JSON.stringify(backendMetrics, null, 2);
  
  const systemPrompt = prompts.scoring.getSystemPrompt();
  const userPrompt = prompts.scoring.getUserPrompt(candidateSummaryJSON, jobSummaryJSON, backendMetricsJSON);
  const rationalizeTask = prompts.scoring.getRationalizeTask();

  return executeConsensus(systemPrompt, userPrompt, rationalizeTask);
}

module.exports = {
  executeConsensus,
  parseResumeMultiLLM,
  parseJobDescriptionMultiLLM,
  scoreCandidateMultiLLM
};

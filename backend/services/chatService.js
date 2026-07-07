const aiService = require('./aiService');

/**
 * Handle user conversation in the AI recruiting chatbot.
 * Takes current message, previous chat history, and active page DOM context.
 */
async function getChatResponse(message, chatHistory = [], pageContext = "") {
  const systemPrompt = `You are "Alphaxine AI", a helpful recruiting and staffing assistant for the Alphaxine Staffing Platform.
  Your goal is to assist recruiters, account managers, and admins with general recruiting questions, staffing constraints, or questions about the active screen they are looking at.
  
  CONTEXTUAL RULES:
  - You will be provided with the active screen's text context (scraped from the DOM).
  - Use this page context to answer queries like "why was this candidate suggested?", "what is the budget for this job?", "which candidate is best?", "explain this JD", or to query tables and cards currently shown.
  - If the user asks questions unrelated to the page context, answer them as a general recruiting expert.
  
  CRITICAL CURRENCY RULE:
  - All currency amounts, budgets, expectations, salary packages, or rates mentioned in your responses MUST be strictly expressed in Indian Rupees (INR / ₹), utilizing Indian numbering naming conventions (e.g. ₹X Lakhs per annum / LPA or ₹X Crores). Never mention USD ($) or other foreign currencies unless explicitly requested.
  
  Return ONLY a valid JSON object matching this structure exactly:
  {
    "response": "Your detailed markdown-formatted helpful answer.",
    "inferredJd": {
       "title": "Normalized title of the job description (only if your response is/contains a generated Job Description, otherwise null)",
       "rawText": "The full markdown Job Description content from your response (only if your response is/contains a generated Job Description, otherwise null)"
    }
  }`;

  // Format history for the prompt
  const formattedHistory = chatHistory
    .slice(-10) // Limit to last 10 messages
    .map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
    .join('\n');

  const userPrompt = `
  Active Page Context (DOM Scrape):
  =========================================
  ${pageContext || "No active page context available (User is likely on general screen)."}
  =========================================
  
  Chat History:
  ${formattedHistory || "No previous history."}
  
  Current User Query: "${message}"
  `;

  try {
    const result = await aiService.executeConsensus(systemPrompt, userPrompt, "Provide recruiting assistance in JSON format");
    if (result && result.finalJson) {
      const resp = result.finalJson.response;
      return {
        response: typeof resp === 'object' ? JSON.stringify(resp, null, 2) : String(resp || ""),
        inferredJd: result.finalJson.inferredJd || null
      };
    }
  } catch (error) {
    console.error("Error in AI Chat service:", error);
  }
  
  return {
    response: "I'm sorry, I encountered an issue processing your request. Please try again.",
    inferredJd: null
  };
}

module.exports = {
  getChatResponse
};

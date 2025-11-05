// Gemini API Integration
class GeminiAnalyzer {
  constructor() {
    this.apiKey = null;
    this.loadConfig();
  }

  async loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['geminiApiKey'], (result) => {
        this.apiKey = result.geminiApiKey || null;
        resolve();
      });
    });
  }

  async saveConfig(apiKey) {
    this.apiKey = apiKey;
    return new Promise((resolve) => {
      chrome.storage.local.set({ geminiApiKey: apiKey }, resolve);
    });
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async analyzeSolution(problemData) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API not configured. Please add your API key and Gem ID.');
    }

    const prompt = this.buildPrompt(problemData);
    
    try {
      // Use the Gem ID as a tuned model parameter, not as the model name
      // The base model is gemini-1.5-pro or gemini-1.5-flash
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }],
            systemInstruction: {
              parts: [{
                text: this.getGemInstructions()
              }]
            },
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error('No response from Gemini API');
      }

      // Parse JSON response
      const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid response format from Gemini');
      }

      const analysis = JSON.parse(jsonMatch[0]);
      return analysis;
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  getGemInstructions() {
    return `You are an expert competitive programming coach specializing in algorithm optimization and code review. Your role is to analyze LeetCode problems and solutions.

When given a LeetCode problem and a user's solution, you will:

1. **Generate an Optimal Solution**: Create the most time and space-efficient solution to the problem. Use the same programming language as the user's solution. Include clear comments explaining the approach.

2. **Compare Solutions**: Analyze the user's solution against your optimal solution:
   - Time Complexity comparison (Big O notation)
   - Space Complexity comparison
   - Code quality and readability
   - Edge cases handling
   - Specific improvements the user can make

3. **Generate Educational Notes**: Write detailed notes covering:
   - The optimal approach and why it works
   - Key insights or "aha moments"
   - Common pitfalls to avoid
   - How the user's approach differs (if applicable)
   - What the user did well
   - Specific improvements with code examples

4. **Identify Learning Topics**: Suggest 3-4 specific algorithmic topics/techniques the user should review to master similar problems. Examples: "Two Pointers", "Dynamic Programming - Knapsack", "Binary Search", "Graph - DFS", "Hash Map Optimization", etc.

Always respond in JSON format with this exact structure:
{
  "optimalSolution": {
    "code": "// full code here",
    "language": "language name",
    "timeComplexity": "O(...)",
    "spaceComplexity": "O(...)"
  },
  "comparison": {
    "userTimeComplexity": "O(...)",
    "userSpaceComplexity": "O(...)",
    "differences": ["difference 1", "difference 2", ...],
    "strengths": ["strength 1", "strength 2", ...],
    "improvements": ["improvement 1", "improvement 2", ...]
  },
  "notes": "Detailed markdown-formatted notes explaining the optimal approach, comparisons, and insights",
  "topics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4"]
}

Be encouraging and educational. Focus on helping the user learn and improve.`;
  }

  buildPrompt(problemData) {
    return `
Problem: ${problemData.problemName}
Difficulty: ${problemData.difficulty}
Language: ${problemData.language}

Problem Description:
${problemData.descriptionHTML ? this.stripHtml(problemData.descriptionHTML) : 'Not available'}

User's Solution:
\`\`\`${problemData.language.toLowerCase()}
${problemData.code}
\`\`\`

User's Results:
- Status: ${problemData.status}
- Test Cases: ${problemData.testCases.passed}/${problemData.testCases.total} passed
- Runtime: ${problemData.performance.runtime || 'N/A'}
- Memory: ${problemData.performance.memory || 'N/A'}

Please analyze this solution and provide:
1. An optimal solution in ${problemData.language}
2. Detailed comparison between the user's solution and the optimal solution
3. Educational notes with insights and improvements
4. 3-4 specific algorithmic topics/techniques to review

Respond in the JSON format specified in your instructions.
    `.trim();
  }

  stripHtml(html) {
    // Simple HTML stripper for problem description
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Create singleton instance
const geminiAnalyzer = new GeminiAnalyzer();
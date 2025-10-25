// background.js — Fixed version using LeetCode GraphQL with proper authentication

async function getLeetCodeCookies() {
    const sessionCookie = await chrome.cookies.get({
      url: "https://leetcode.com",
      name: "LEETCODE_SESSION"
    });
    const csrfCookie = await chrome.cookies.get({
      url: "https://leetcode.com",
      name: "csrftoken"
    });
  
    if (!sessionCookie || !csrfCookie) {
    throw new Error("Could not read LEETCODE_SESSION or csrftoken cookies. Make sure you're logged into LeetCode.");
    }
  
    return { session: sessionCookie.value, csrf: csrfCookie.value };
  }
  
  // --------------------------------
  // Helper to send GraphQL request
  // --------------------------------
  async function graphqlRequest(query, variables = {}) {
  try {
    const cookies = await getLeetCodeCookies();
    console.log("Making GraphQL request with cookies:", {
      hasSession: !!cookies.session,
      hasCSRF: !!cookies.csrf,
      sessionLength: cookies.session?.length,
      csrfLength: cookies.csrf?.length
    });
  
    const res = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrftoken": cookies.csrf,
        "Cookie": `LEETCODE_SESSION=${cookies.session}; csrftoken=${cookies.csrf}`,
        "Referer": "https://leetcode.com/",
        "Origin": "https://leetcode.com"
      },
      body: JSON.stringify({ query, variables }),
      credentials: "include"
    });

    console.log("GraphQL response status:", res.status, res.statusText);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
  
    const data = await res.json();
    console.log("GraphQL response data:", data);
    
    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }
    
    return data;
  } catch (error) {
    console.error("GraphQL request failed:", error);
    throw error;
  }
  }
  
  // --------------------------------
  // Step 1: Get recent accepted subs
  // --------------------------------
  async function fetchRecentAccepted(username) {
    const query = `
      query recentAcSubmissionList($username: String!) {
        recentAcSubmissionList(username: $username) {
          id
          title
          titleSlug
          timestamp
        }
      }
    `;
    const variables = { username };
    const result = await graphqlRequest(query, variables);
    const list = result.data?.recentAcSubmissionList || [];
    console.log("Fetched recent accepted list:", list);
    return list;
  }
  
  // --------------------------------
  // Step 2: Get code for submissionId
  // --------------------------------
  async function fetchSubmissionDetail(submissionId) {
    const query = `
      query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) {
          id
          code
          lang
          runtime
          memory
          timestamp
          statusDisplay
        }
      }
    `;
    const variables = { submissionId: parseInt(submissionId) };
    const result = await graphqlRequest(query, variables);
    return result.data?.submissionDetails || null;
  }
  
  // --------------------------------
// Step 3: Combine them together with scraping approach
  // --------------------------------
async function fetchAllSolvedProblems(username, limit = 100) {
  try {
    console.log(`Fetching solved problems for user: ${username}`);
    
    const recent = await fetchRecentAccepted(username);
    if (!recent.length) {
      console.log("No recent accepted submissions found");
      return {
        solvedCount: 0,
        submissions: []
      };
    }

    console.log(`Found ${recent.length} recent submissions, scraping submission pages`);
  
    const results = [];
    const submissionsToProcess = recent.slice(0, Math.min(limit, recent.length));
    
    for (let i = 0; i < submissionsToProcess.length; i++) {
      const sub = submissionsToProcess[i];
      console.log(`Scraping submission ${i + 1}/${submissionsToProcess.length}: ${sub.titleSlug}`);
      
      try {
        const detail = await scrapeSubmissionPage(sub.id, sub.title, sub.titleSlug);
        results.push(detail);
        
        // Add delay to avoid overwhelming the server
        if (i < submissionsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (e) {
        console.error(`Error scraping submission ${sub.titleSlug}:`, e);
        // Add basic info even if scraping fails
        results.push({
          id: sub.id,
          title: sub.title,
          slug: sub.titleSlug,
          lang: 'unknown',
          runtime: 'N/A',
          memory: 'N/A',
          code: `// Error scraping submission for ${sub.title}\n// Please visit: https://leetcode.com/problems/${sub.titleSlug}/submissions/${sub.id}/`,
          timestamp: sub.timestamp,
          statusDisplay: 'Accepted'
        });
      }
    }

    console.log(`Total submissions scraped: ${results.length}`);
    return {
      solvedCount: results.length,
      submissions: results
    };
    
  } catch (error) {
    console.error("Error in fetchAllSolvedProblems:", error);
    throw error;
  }
}

// --------------------------------
// Get user profile information
// --------------------------------
async function fetchUserProfile(username) {
  const query = `
    query userPublicProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          realName
          userAvatar
          ranking
          aboutMe
          school
          websites
          countryName
          company
          jobTitle
          postViewCount
          postViewCountDiff
          reputation
          reputationDiff
          solutionCount
          solutionCountDiff
        }
        submitStats {
          acSubmissionNum {
            difficulty
            count
            submissions
          }
          totalSubmissionNum {
            difficulty
            count
            submissions
          }
        }
      }
    }
  `;
  const variables = { username };
  const result = await graphqlRequest(query, variables);
  return result.data?.matchedUser || null;
}

// --------------------------------
// Get user's submission calendar
// --------------------------------
async function fetchSubmissionCalendar(username, year = null) {
  const query = `
    query userProfileCalendar($username: String!, $year: Int) {
      matchedUser(username: $username) {
        userCalendar(year: $year) {
          activeYears
          streak
          totalActiveDays
          dccBadges {
            timestamp
            badge {
              name
              icon
            }
          }
          submissionCalendar
        }
      }
    }
  `;
  const variables = { username, year: year || new Date().getFullYear() };
  const result = await graphqlRequest(query, variables);
  return result.data?.matchedUser?.userCalendar || null;
}

// --------------------------------
// Scrape submission page to get code and details
// --------------------------------
async function scrapeSubmissionPage(submissionId, title, titleSlug) {
  try {
    console.log(`Scraping submission page for ${titleSlug} (ID: ${submissionId})`);
    
    // Get cookies for authentication
    const cookies = await getLeetCodeCookies();
    
    // Construct the submission URL
    const submissionUrl = `https://leetcode.com/problems/${titleSlug}/submissions/${submissionId}/`;
    
    // Fetch the submission page with proper authentication
    const response = await fetch(submissionUrl, {
      method: 'GET',
      headers: {
        'Cookie': `LEETCODE_SESSION=${cookies.session}; csrftoken=${cookies.csrf}`,
        'Referer': 'https://leetcode.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`Fetched submission page for ${titleSlug}`);
    
    // Parse the HTML to extract submission data
    return parseSubmissionHTML(html, submissionId, title, titleSlug);
    
  } catch (error) {
    console.error(`Error scraping submission ${submissionId}:`, error);
    return {
      id: submissionId,
      title: title,
      slug: titleSlug,
      lang: 'unknown',
      runtime: 'N/A',
      memory: 'N/A',
      code: `// Error fetching code for ${title}\n// Please visit: https://leetcode.com/problems/${titleSlug}/submissions/${submissionId}/`,
      timestamp: Math.floor(Date.now() / 1000),
      statusDisplay: 'Accepted'
    };
  }
}

// --------------------------------
// Parse HTML to extract submission details
// --------------------------------
function parseSubmissionHTML(html, submissionId, title, titleSlug) {
  try {
    // Try to find the code in various possible locations
    let code = '';
    let lang = 'unknown';
    let runtime = 'N/A';
    let memory = 'N/A';
    
    // Method 1: Look for code in script tags with submission data
    const scriptMatches = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        if (script.includes('submissionCode') || script.includes('code')) {
          // Try to extract code from JSON data
          const codeMatch = script.match(/"code":\s*"([^"]+)"/);
          if (codeMatch) {
            code = codeMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
          }
          
          // Try to extract language
          const langMatch = script.match(/"lang":\s*"([^"]+)"/);
          if (langMatch) {
            lang = langMatch[1];
          }
          
          // Try to extract runtime
          const runtimeMatch = script.match(/"runtime":\s*"([^"]+)"/);
          if (runtimeMatch) {
            runtime = runtimeMatch[1];
          }
          
          // Try to extract memory
          const memoryMatch = script.match(/"memory":\s*"([^"]+)"/);
          if (memoryMatch) {
            memory = memoryMatch[1];
          }
          
          break;
        }
      }
    }
    
    // Method 2: Look for code in pre tags or code blocks
    if (!code) {
      const preMatches = html.match(/<pre[^>]*>[\s\S]*?<\/pre>/gi);
      if (preMatches) {
        for (const pre of preMatches) {
          const text = pre.replace(/<[^>]*>/g, '').trim();
          if (text && text.length > 50 && !text.includes('Loading...')) {
            code = text;
            break;
          }
        }
      }
    }
    
    // Method 3: Look for language info in the page
    if (lang === 'unknown') {
      const langMatch = html.match(/data-lang="([^"]+)"/);
      if (langMatch) {
        lang = langMatch[1];
      }
    }
    
    // If we still don't have code, provide a helpful message
    if (!code || code.length < 10) {
      code = `// Unable to extract code from submission page\n// Please visit: https://leetcode.com/problems/${titleSlug}/submissions/${submissionId}/\n// to view the code manually`;
    }
    
    console.log(`Extracted code for ${titleSlug}: ${code.length} characters, lang: ${lang}`);
    
    return {
      id: submissionId,
      title: title,
      slug: titleSlug,
      lang: lang,
      runtime: runtime,
      memory: memory,
      code: code,
      timestamp: Math.floor(Date.now() / 1000),
      statusDisplay: 'Accepted'
    };
    
  } catch (error) {
    console.error(`Error parsing HTML for ${submissionId}:`, error);
    return {
      id: submissionId,
      title: title,
      slug: titleSlug,
      lang: 'unknown',
      runtime: 'N/A',
      memory: 'N/A',
      code: `// Error parsing submission page for ${title}\n// Please visit: https://leetcode.com/problems/${titleSlug}/submissions/${submissionId}/`,
      timestamp: Math.floor(Date.now() / 1000),
      statusDisplay: 'Accepted'
    };
  }
  }
  
  // --------------------------------
// Message listener for popup communication
  // --------------------------------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("Received message:", msg);
  
    if (msg.action === "fetch_submissions") {
      console.log("Fetching submissions for", msg.username);
    
    // Use background script approach only - no content script
    console.log("Using background script approach for all requests");
    fetchAllSolvedProblems(msg.username, msg.limit || 100)
      .then(data => {
        console.log("Sending response:", data);
        sendResponse({ success: true, data });
      })
      .catch(err => {
        console.error("Error in fetch_submissions:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep the message channel open for async response
  }
  
  if (msg.action === "fetch_profile") {
    console.log("Fetching profile for", msg.username);
    fetchUserProfile(msg.username)
      .then(data => {
        console.log("Profile data:", data);
        sendResponse({ success: true, data });
      })
      .catch(err => {
        console.error("Error in fetch_profile:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
  
  if (msg.action === "fetch_calendar") {
    console.log("Fetching calendar for", msg.username);
    fetchSubmissionCalendar(msg.username, msg.year)
      .then(data => {
        console.log("Calendar data:", data);
        sendResponse({ success: true, data });
      })
      .catch(err => {
        console.error("Error in fetch_calendar:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
  
  if (msg.action === "test_connection") {
    console.log("Testing LeetCode connection...");
    getLeetCodeCookies()
      .then(cookies => {
        console.log("Cookies found:", { 
          hasSession: !!cookies.session, 
          hasCSRF: !!cookies.csrf,
          sessionLength: cookies.session?.length,
          csrfLength: cookies.csrf?.length
        });
        sendResponse({ 
          success: true, 
          data: { 
            hasSession: !!cookies.session, 
            hasCSRF: !!cookies.csrf,
            message: "Cookies found successfully"
          } 
        });
      })
      .catch(err => {
        console.error("Error testing connection:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
  
  if (msg.action === "fetch_submission_details") {
    console.log("Fetching submission details for IDs:", msg.submissionIds);
    
    const fetchSubmissionDetails = async () => {
      const results = [];
      const submissions = msg.submissions || [];
      
      for (let i = 0; i < msg.submissionIds.length; i++) {
        const submissionId = msg.submissionIds[i];
        const submission = submissions[i];
        
        console.log(`Scraping submission ${i + 1}/${msg.submissionIds.length}: ${submission?.titleSlug || submissionId}`);
        
        try {
          const detail = await scrapeSubmissionPage(submissionId, submission?.title || 'Unknown', submission?.titleSlug || 'unknown');
          results.push(detail);
          
          // Add delay to avoid overwhelming the server
          if (i < msg.submissionIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (e) {
          console.error(`Error scraping submission ${submissionId}:`, e);
          // Add basic info even if scraping fails
          if (submission) {
            results.push({
              id: submissionId,
              title: submission.title,
              slug: submission.titleSlug,
              lang: 'unknown',
              runtime: 'N/A',
              memory: 'N/A',
              code: `// Error scraping submission for ${submission.title}\n// Please visit: https://leetcode.com/problems/${submission.titleSlug}/submissions/${submissionId}/`,
              timestamp: submission.timestamp,
              statusDisplay: 'Accepted'
            });
          }
        }
      }
      
      return results;
    };
    
    fetchSubmissionDetails()
      .then(results => {
        console.log(`Scraped ${results.length} submission details`);
        sendResponse({ success: true, data: results });
      })
      .catch(err => {
        console.error("Error scraping submission details:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
    }
  });
  
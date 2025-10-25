// content.js - Enhanced LeetCode username detection and user experience

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    STORAGE_KEY: 'leetcode_username',
    DETECTION_INTERVAL: 2000,
    MAX_ATTEMPTS: 10
  };

  let detectionAttempts = 0;
  let isDetecting = false;

  // Enhanced username detection with multiple methods
  function detectUsername() {
    if (isDetecting || detectionAttempts >= CONFIG.MAX_ATTEMPTS) {
      return;
    }

    isDetecting = true;
    detectionAttempts++;

    console.log(`[LeetCode Tracker] Attempting username detection (${detectionAttempts}/${CONFIG.MAX_ATTEMPTS})`);

    // Method 1: Check navbar user link
    const userLink = document.querySelector('a[href^="/u/"]');
    if (userLink) {
      const username = userLink.getAttribute("href").replace("/u/", "").replace("/", "");
      if (username && username !== '') {
        saveUsername(username, 'navbar_link');
        return;
      }
    }

    // Method 2: Check user avatar or profile elements
    const avatarElements = document.querySelectorAll('[data-testid="avatar"], .avatar, [class*="avatar"]');
    for (const element of avatarElements) {
      const title = element.getAttribute('title') || element.getAttribute('alt');
      if (title && title.includes('/')) {
        const username = title.split('/').pop();
        if (username && username !== '') {
          saveUsername(username, 'avatar_title');
          return;
        }
      }
    }

    // Method 3: Check for username in page content
    const usernamePatterns = [
      /\/u\/([^\/\s]+)/g,
      /@([a-zA-Z0-9_-]+)/g,
      /username[:\s]*([a-zA-Z0-9_-]+)/gi
    ];

    for (const pattern of usernamePatterns) {
      const matches = document.body.textContent.match(pattern);
      if (matches && matches.length > 0) {
        const username = matches[0].replace(/[\/@u:]/g, '').trim();
        if (username && username !== '') {
          saveUsername(username, 'content_pattern');
          return;
        }
      }
    }

    // Method 4: Check localStorage for LeetCode data
    try {
      const leetcodeData = localStorage.getItem('leetcode');
      if (leetcodeData) {
        const data = JSON.parse(leetcodeData);
        if (data.username) {
          saveUsername(data.username, 'localStorage');
          return;
        }
      }
    } catch (e) {
      console.log('[LeetCode Tracker] Could not parse localStorage data');
    }

    // Method 5: Check for user info in script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      if (script.textContent && script.textContent.includes('username')) {
        const usernameMatch = script.textContent.match(/username["\s]*:["\s]*([^"',\s]+)/);
        if (usernameMatch && usernameMatch[1]) {
          saveUsername(usernameMatch[1], 'script_content');
          return;
        }
      }
    }

    // If no username found, try again after interval
    if (detectionAttempts < CONFIG.MAX_ATTEMPTS) {
      setTimeout(() => {
        isDetecting = false;
        detectUsername();
      }, CONFIG.DETECTION_INTERVAL);
    } else {
      console.log('[LeetCode Tracker] Username detection failed after maximum attempts');
      isDetecting = false;
    }
  }

  // Save username to storage with metadata
  function saveUsername(username, detectionMethod) {
    const usernameData = {
      username: username,
      detectedAt: new Date().toISOString(),
      detectionMethod: detectionMethod,
      pageUrl: window.location.href
    };

    chrome.storage.local.set({ 
      [CONFIG.STORAGE_KEY]: username,
      [`${CONFIG.STORAGE_KEY}_metadata`]: usernameData
    });

    console.log(`[LeetCode Tracker] Username detected: ${username} (via ${detectionMethod})`);
    
    // Show notification to user
    showNotification(`LeetCode username detected: ${username}`, 'success');
    
    isDetecting = false;
  }

  // Show user notification
  function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotification = document.querySelector('.leetcode-tracker-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `leetcode-tracker-notification ${type}`;
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        max-width: 300px;
        word-wrap: break-word;
      ">
        <strong>LeetCode Tracker:</strong> ${message}
      </div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 4000);
  }

  // Enhanced page analysis
  function analyzePage() {
    const pageInfo = {
      url: window.location.href,
      title: document.title,
      isProblemPage: window.location.pathname.includes('/problems/'),
      isProfilePage: window.location.pathname.includes('/u/'),
      isSubmissionPage: window.location.pathname.includes('/submissions/'),
      timestamp: new Date().toISOString()
    };

    // Store page context for better user experience
    chrome.storage.local.set({ 
      'leetcode_page_context': pageInfo 
    });

    console.log('[LeetCode Tracker] Page analyzed:', pageInfo);
  }

  // Get CSRF token from page
  function getCSRFToken() {
    // Try to get CSRF token from meta tag
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) {
      return metaTag.getAttribute('content');
    }
    
    // Try to get from cookies
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrftoken') {
        return value;
      }
    }
    
    // Try to get from window object (if available)
    if (window.csrfToken) {
      return window.csrfToken;
    }
    
    return null;
  }

  // GraphQL request function for content script
  async function graphqlRequest(query, variables = {}) {
    try {
      console.log('[LeetCode Tracker] Making GraphQL request from content script');
      
      // Get CSRF token
      const csrfToken = getCSRFToken();
      console.log('[LeetCode Tracker] CSRF token found:', !!csrfToken);
      
      const headers = {
        "Content-Type": "application/json",
        "Referer": "https://leetcode.com/",
        "Origin": "https://leetcode.com"
      };
      
      // Add CSRF token if available
      if (csrfToken) {
        headers["x-csrftoken"] = csrfToken;
      }
      
      const res = await fetch("https://leetcode.com/graphql/", {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
        credentials: "include"
      });

      console.log('[LeetCode Tracker] GraphQL response status:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[LeetCode Tracker] Response body:', errorText);
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      console.log('[LeetCode Tracker] GraphQL response data:', data);
      
      if (data.errors) {
        console.error('[LeetCode Tracker] GraphQL errors:', data.errors);
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }
      
      return data;
    } catch (error) {
      console.error('[LeetCode Tracker] GraphQL request failed:', error);
      throw error;
    }
  }

  // Fetch recent accepted submissions
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
    console.log('[LeetCode Tracker] Fetched recent accepted list:', list);
    return list;
  }

  // Fetch submission details with fallback approach
  async function fetchSubmissionDetail(submissionId) {
    try {
      // First try: Use the existing LeetCode page's GraphQL context
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
      
      if (result.data?.submissionDetails) {
        return result.data.submissionDetails;
      }
      
      // Fallback: Try to get submission data from page context
      console.log('[LeetCode Tracker] GraphQL failed, trying page context approach');
      return await getSubmissionFromPageContext(submissionId);
      
    } catch (error) {
      console.error('[LeetCode Tracker] GraphQL submission detail failed:', error);
      
      // Fallback: Try to get submission data from page context
      console.log('[LeetCode Tracker] Trying page context approach as fallback');
      return await getSubmissionFromPageContext(submissionId);
    }
  }

  // Fallback method to get submission data from page context
  async function getSubmissionFromPageContext(submissionId) {
    try {
      // Try to find submission data in the page's global variables
      if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
        const props = window.__NEXT_DATA__.props;
        if (props.pageProps && props.pageProps.submission) {
          const submission = props.pageProps.submission;
          if (submission.id === submissionId) {
            return {
              id: submission.id,
              code: submission.code,
              lang: submission.lang,
              runtime: submission.runtime,
              memory: submission.memory,
              timestamp: submission.timestamp,
              statusDisplay: submission.statusDisplay
            };
          }
        }
      }
      
      // Try to get from window object
      if (window.submissionData && window.submissionData.id === submissionId) {
        return window.submissionData;
      }
      
      // If we can't get the actual code, return basic info
      console.log('[LeetCode Tracker] Could not fetch submission details, returning basic info');
      return {
        id: submissionId,
        code: '// Code not available - please visit the submission page directly',
        lang: 'unknown',
        runtime: 'N/A',
        memory: 'N/A',
        timestamp: Math.floor(Date.now() / 1000),
        statusDisplay: 'Accepted'
      };
      
    } catch (error) {
      console.error('[LeetCode Tracker] Page context approach failed:', error);
      return null;
    }
  }

  // Scrape submission page to get code and details
  async function scrapeSubmissionPage(submissionId, title, titleSlug) {
    try {
      console.log(`[LeetCode Tracker] Scraping submission page for ${titleSlug} (ID: ${submissionId})`);
      
      // Construct the submission URL
      const submissionUrl = `https://leetcode.com/problems/${titleSlug}/submissions/${submissionId}/`;
      
      // Fetch the submission page
      const response = await fetch(submissionUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Referer': 'https://leetcode.com/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      console.log(`[LeetCode Tracker] Fetched submission page for ${titleSlug}`);
      
      // Parse the HTML to extract submission data
      return parseSubmissionHTML(html, submissionId, title, titleSlug);
      
    } catch (error) {
      console.error(`[LeetCode Tracker] Error scraping submission ${submissionId}:`, error);
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

  // Parse HTML to extract submission details
  function parseSubmissionHTML(html, submissionId, title, titleSlug) {
    try {
      // Create a temporary DOM parser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Try to find the code in various possible locations
      let code = '';
      let lang = 'unknown';
      let runtime = 'N/A';
      let memory = 'N/A';
      
      // Method 1: Look for code in script tags with submission data
      const scripts = doc.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent;
        if (content.includes('submissionCode') || content.includes('code')) {
          // Try to extract code from JSON data
          const codeMatch = content.match(/"code":\s*"([^"]+)"/);
          if (codeMatch) {
            code = codeMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
          }
          
          // Try to extract language
          const langMatch = content.match(/"lang":\s*"([^"]+)"/);
          if (langMatch) {
            lang = langMatch[1];
          }
          
          // Try to extract runtime
          const runtimeMatch = content.match(/"runtime":\s*"([^"]+)"/);
          if (runtimeMatch) {
            runtime = runtimeMatch[1];
          }
          
          // Try to extract memory
          const memoryMatch = content.match(/"memory":\s*"([^"]+)"/);
          if (memoryMatch) {
            memory = memoryMatch[1];
          }
          
          break;
        }
      }
      
      // Method 2: Look for code in pre tags or code blocks
      if (!code) {
        const codeElements = doc.querySelectorAll('pre, code, .monaco-editor');
        for (const element of codeElements) {
          const text = element.textContent || element.innerText;
          if (text && text.length > 50 && !text.includes('Loading...')) {
            code = text;
            break;
          }
        }
      }
      
      // Method 3: Look for language info in the page
      if (lang === 'unknown') {
        const langElements = doc.querySelectorAll('[data-lang], .language-info, .lang-info');
        for (const element of langElements) {
          const langText = element.textContent || element.getAttribute('data-lang');
          if (langText && langText.length < 20) {
            lang = langText.trim();
            break;
          }
        }
      }
      
      // If we still don't have code, provide a helpful message
      if (!code || code.length < 10) {
        code = `// Unable to extract code from submission page\n// Please visit: https://leetcode.com/problems/${titleSlug}/submissions/${submissionId}/\n// to view the code manually`;
      }
      
      console.log(`[LeetCode Tracker] Extracted code for ${titleSlug}: ${code.length} characters, lang: ${lang}`);
      
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
      console.error(`[LeetCode Tracker] Error parsing HTML for ${submissionId}:`, error);
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

  // Main function to fetch all solved problems from content script
  async function fetchSubmissionsFromContentScript(username, limit = 100) {
    try {
      console.log(`[LeetCode Tracker] Fetching solved problems for user: ${username}`);
      
      const recent = await fetchRecentAccepted(username);
      if (!recent.length) {
        console.log('[LeetCode Tracker] No recent accepted submissions found');
        return {
          solvedCount: 0,
          submissions: []
        };
      }

      console.log(`[LeetCode Tracker] Found ${recent.length} recent submissions, passing to background script for scraping`);
      
      // Get the list of submissions from content script, but fetch details via background script
      const submissionIds = recent.slice(0, Math.min(limit, recent.length)).map(sub => sub.id);
      
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "fetch_submission_details",
          submissionIds: submissionIds,
          submissions: recent.slice(0, Math.min(limit, recent.length))
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[LeetCode Tracker] Background script error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          if (response && response.success) {
            console.log(`[LeetCode Tracker] Background script returned ${response.data.length} submissions`);
            resolve({
              solvedCount: response.data.length,
              submissions: response.data
            });
          } else {
            console.error('[LeetCode Tracker] Background script failed:', response?.error);
            reject(new Error(response?.error || 'Background script failed'));
          }
        });
      });
      
    } catch (error) {
      console.error('[LeetCode Tracker] Error in fetchSubmissionsFromContentScript:', error);
      throw error;
    }
  }

  // Listen for page changes (SPA navigation)
  function setupPageChangeListener() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        console.log('[LeetCode Tracker] Page changed to:', url);
        
        // Re-analyze page and try to detect username
        setTimeout(() => {
          analyzePage();
          detectUsername();
        }, 1000);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // Initialize the content script
  function initialize() {
    console.log('[LeetCode Tracker] Content script initialized');
    
    // Analyze current page
    analyzePage();
    
    // Try to detect username
    detectUsername();
    
    // Setup page change listener for SPAs
    setupPageChangeListener();
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'get_page_info') {
        sendResponse({
          url: window.location.href,
          title: document.title,
          username: null // Will be populated by detection
        });
      }
      
      if (request.action === 'fetch_submissions_content') {
        console.log('[LeetCode Tracker] Content script handling fetch_submissions');
        fetchSubmissionsFromContentScript(request.username, request.limit)
          .then(data => {
            console.log('[LeetCode Tracker] Content script response:', data);
            sendResponse({ success: true, data });
          })
          .catch(err => {
            console.error('[LeetCode Tracker] Content script error:', err);
            sendResponse({ success: false, error: err.message });
          });
        return true; // Keep message channel open
      }
    });
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  })();
  
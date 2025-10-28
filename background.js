// Background service worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('LeetCode Tracker extension installed');
    
    // Initialize storage
    chrome.storage.local.get(['submissions'], (result) => {
      if (!result.submissions) {
        chrome.storage.local.set({ submissions: [] });
      }
    });
  });
  
  // Listen for tab updates to detect LeetCode pages
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('leetcode.com/problems')) {
      // You could add badge or notification here
      console.log('LeetCode problem page detected');
    }
  });
  
  // Handle messages from content script or popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveToStorage') {
      chrome.storage.local.get(['submissions'], (result) => {
        const submissions = result.submissions || [];
        submissions.push(request.data);
        
        chrome.storage.local.set({ submissions }, () => {
          sendResponse({ success: true });
        });
      });
      return true; // Keep message channel open
    }
    
    if (request.action === 'getSubmissions') {
      chrome.storage.local.get(['submissions'], (result) => {
        sendResponse({ submissions: result.submissions || [] });
      });
      return true;
    }
  });
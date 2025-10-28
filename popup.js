// Popup script
let currentData = null;

// DOM elements
const extractBtn = document.getElementById('extractBtn');
const saveBtn = document.getElementById('saveBtn');
const viewAllBtn = document.getElementById('viewAllBtn');
const dataPreview = document.getElementById('dataPreview');
const notesSection = document.getElementById('notesSection');
const notesInput = document.getElementById('notesInput');
const saveSection = document.getElementById('saveSection');
const submissionsList = document.getElementById('submissionsList');
const messageDiv = document.getElementById('message');

// Show message
function showMessage(text, type = 'success') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';
  
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 3000);
}

// Format data for display
function formatDataPreview(data) {
  const statusClass = data.status === 'Accepted' ? 'accepted' : 'wrong';
  
  return `
    <div class="field">
      <div class="field-label">Problem</div>
      <div class="field-value"><strong>${data.problemName || 'Unknown'}</strong></div>
    </div>
    <div class="field">
      <div class="field-label">Difficulty</div>
      <div class="field-value">${data.difficulty}</div>
    </div>
    <div class="field">
      <div class="field-label">Language</div>
      <div class="field-value">${data.language}</div>
    </div>
    <div class="field">
      <div class="field-label">Status</div>
      <div class="field-value">
        <span class="status ${statusClass}">${data.status}</span>
      </div>
    </div>
    <div class="field">
      <div class="field-label">Test Cases</div>
      <div class="field-value">${data.testCases.passed} / ${data.testCases.total} passed</div>
    </div>
    ${data.performance.runtime ? `
    <div class="field">
      <div class="field-label">Performance</div>
      <div class="field-value">
        Runtime: ${data.performance.runtime}${data.performance.runtimePercentile ? ` (Beats ${data.performance.runtimePercentile})` : ''}<br>
        Memory: ${data.performance.memory || 'N/A'}${data.performance.memoryPercentile ? ` (Beats ${data.performance.memoryPercentile})` : ''}
      </div>
    </div>
    ` : ''}
    ${data.code && data.code !== 'Code not found' ? `
    <div class="field">
      <div class="field-label">Code</div>
      <div class="field-value">
        <pre class="code-preview">${escapeHtml(data.code)}</pre>
        <div style="font-size: 11px; color: #888; margin-top: 4px;">
          ${data.code.split('\n').length} lines • ${data.code.length} characters
        </div>
      </div>
    </div>
    ` : ''}
    <div class="field">
      <div class="field-label">Timestamp</div>
      <div class="field-value">${new Date(data.timestamp).toLocaleString()}</div>
    </div>
  `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Extract data from current page
extractBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('leetcode.com')) {
      showMessage('Please navigate to a LeetCode submission page', 'error');
      return;
    }

    extractBtn.textContent = 'Extracting...';
    extractBtn.disabled = true;

    // First, inject the content script if it's not already there
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      // Content script might already be injected, that's fine
      console.log('Content script already injected or error:', e);
    }

    // Small delay to ensure script is ready
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: 'extractData' }, (response) => {
        extractBtn.textContent = 'Extract Current Submission';
        extractBtn.disabled = false;

        if (chrome.runtime.lastError) {
          showMessage('Error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (response && response.success) {
          currentData = response.data;
          dataPreview.innerHTML = formatDataPreview(currentData);
          notesSection.style.display = 'block';
          saveSection.style.display = 'block';
          submissionsList.style.display = 'none';
          showMessage('Data extracted successfully!');
        } else {
          showMessage('Failed to extract data. Make sure you\'re on a submission page.', 'error');
        }
      });
    }, 100);
  } catch (error) {
    console.error('Error:', error);
    showMessage('Error: ' + error.message, 'error');
    extractBtn.textContent = 'Extract Current Submission';
    extractBtn.disabled = false;
  }
});

// Save submission
saveBtn.addEventListener('click', () => {
  if (!currentData) {
    showMessage('No data to save', 'error');
    return;
  }

  // Add notes to data
  currentData.notes = notesInput.value;

  // Generate unique ID
  currentData.id = Date.now().toString();

  // Save to Chrome storage
  chrome.storage.local.get(['submissions'], (result) => {
    const submissions = result.submissions || [];
    submissions.unshift(currentData); // Add to beginning
    
    // Keep only last 100 submissions
    if (submissions.length > 100) {
      submissions.length = 100;
    }

    chrome.storage.local.set({ submissions }, () => {
      showMessage('Submission saved successfully!');
      notesInput.value = '';
      
      // Optionally clear the preview after saving
      setTimeout(() => {
        dataPreview.innerHTML = '';
        notesSection.style.display = 'none';
        saveSection.style.display = 'none';
        currentData = null;
      }, 1500);
    });
  });
});

// View all submissions
viewAllBtn.addEventListener('click', () => {
  chrome.storage.local.get(['submissions'], (result) => {
    const submissions = result.submissions || [];
    
    if (submissions.length === 0) {
      submissionsList.innerHTML = '<div style="color: #888; padding: 20px; text-align: center;">No submissions saved yet</div>';
    } else {
      submissionsList.innerHTML = submissions.map(sub => `
        <div class="submission-item" data-id="${sub.id}">
          <strong>${sub.problemName}</strong>
          <div style="font-size: 12px; color: #888; margin-top: 4px;">
            ${sub.language} • ${sub.status} • ${new Date(sub.timestamp).toLocaleDateString()}
          </div>
          ${sub.notes ? `<div style="font-size: 11px; color: #aaa; margin-top: 2px; font-style: italic;">${escapeHtml(sub.notes.substring(0, 50))}${sub.notes.length > 50 ? '...' : ''}</div>` : ''}
        </div>
      `).join('');
      
      // Add click handlers
      document.querySelectorAll('.submission-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const submission = submissions.find(s => s.id === id);
          if (submission) {
            currentData = submission;
            dataPreview.innerHTML = formatDataPreview(submission);
            notesInput.value = submission.notes || '';
            notesSection.style.display = 'block';
            saveSection.style.display = 'none';
            submissionsList.style.display = 'none';
          }
        });
      });
    }
    
    submissionsList.style.display = 'block';
    dataPreview.innerHTML = '';
    notesSection.style.display = 'none';
    saveSection.style.display = 'none';
  });
});
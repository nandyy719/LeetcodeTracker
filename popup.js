// Popup script
let currentData = null;
let editingFromList = false;
let geminiAnalysis = null;

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

// Gemini elements
const geminiSection = document.getElementById('geminiSection');
const analyzeBtn = document.getElementById('analyzeBtn');
const configBtn = document.getElementById('configBtn');
const geminiResults = document.getElementById('geminiResults');
const viewSolutionBtn = document.getElementById('viewSolutionBtn');
const viewNotesBtn = document.getElementById('viewNotesBtn');
const geminiTopics = document.getElementById('geminiTopics');
const configModal = document.getElementById('configModal');
const apiKeyInput = document.getElementById('apiKeyInput');
const gemIdInput = document.getElementById('gemIdInput');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const cancelConfigBtn = document.getElementById('cancelConfigBtn');
const contentModal = document.getElementById('contentModal');
const contentModalTitle = document.getElementById('contentModalTitle');
const contentModalBody = document.getElementById('contentModalBody');
const closeContentBtn = document.getElementById('closeContentBtn');

// Show message
function showMessage(text, type = 'success') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';
  
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Render editable form for data
function renderEditableForm(data) {
  const difficulties = ['Easy','Medium','Hard'];
  const statuses = ['Accepted','Wrong Answer','Time Limit Exceeded','Runtime Error','Memory Limit Exceeded','Compile Error','Output Limit Exceeded','Unknown'];
  const langs = ['Python3','Python','Java','JavaScript','TypeScript','C++','C','C#','Go','Rust','Swift','Kotlin','PHP','Scala','Other'];

  dataPreview.innerHTML = `
    <div class="field">
      <div class="field-label">Problem</div>
      <input type="text" id="problemNameInput" value="${escapeHtml(data.problemName || '')}">
    </div>
    <div class="field">
      <div class="field-label">Language</div>
      <select id="languageInput">
        ${langs.map(l => `<option ${String(data.language||'')===l?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="inline-fields">
      <div class="field">
        <div class="field-label">Difficulty</div>
        <select id="difficultyInput">
          ${difficulties.map(d => `<option ${data.difficulty===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <div class="field-label">Status</div>
        <select id="statusInput">${statuses.map(s => `<option ${data.status===s?'selected':''}>${s}</option>`).join('')}</select>
      </div>
    </div>
    <div class="inline-fields">
      <div class="field">
        <div class="field-label">Test Cases Passed</div>
        <input type="number" id="testsPassedInput" value="${Number(data?.testCases?.passed||0)}">
      </div>
      <div class="field">
        <div class="field-label">Test Cases Total</div>
        <input type="number" id="testsTotalInput" value="${Number(data?.testCases?.total||0)}">
      </div>
    </div>
    <div class="field">
      <div class="field-label">Runtime</div>
      <input type="text" id="runtimeInput" value="${escapeHtml(data?.performance?.runtime || '')}">
    </div>
    <div class="field">
      <div class="field-label">Memory</div>
      <input type="text" id="memoryInput" value="${escapeHtml(data?.performance?.memory || '')}">
    </div>
    <div class="field">
      <div class="field-label">Code</div>
      <textarea id="codeInput" style="min-height: 150px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 12px; line-height: 1.4;">${escapeHtml(data.code || '')}</textarea>
    </div>
  `;
}

function collectFormEditsInto(data) {
  const get = (id) => document.getElementById(id);
  const edited = { ...data };
  edited.problemName = get('problemNameInput')?.value || edited.problemName;
  edited.difficulty = get('difficultyInput')?.value || edited.difficulty;
  edited.language = get('languageInput')?.value || edited.language;
  edited.status = get('statusInput')?.value || edited.status;
  const passed = parseInt(get('testsPassedInput')?.value || '0', 10);
  const total = parseInt(get('testsTotalInput')?.value || '0', 10);
  edited.testCases = { passed: isNaN(passed)?0:passed, total: isNaN(total)?0:total };
  
  // Update performance
  if (!edited.performance) edited.performance = {};
  edited.performance.runtime = get('runtimeInput')?.value || edited.performance.runtime;
  edited.performance.memory = get('memoryInput')?.value || edited.performance.memory;
  
  edited.code = get('codeInput')?.value || edited.code;
  return edited;
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
          geminiAnalysis = null; // Reset Gemini analysis for new extraction
          renderEditableForm(currentData);
          notesSection.style.display = 'block';
          saveSection.style.display = 'block';
          geminiSection.style.display = 'block';
          geminiResults.style.display = 'none'; // Hide results until analysis
          submissionsList.style.display = 'none';
          editingFromList = false;
          saveBtn.textContent = 'Save Submission';
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

  // Merge edits from the form into currentData
  currentData = collectFormEditsInto(currentData);

  // Add notes to data
  currentData.notes = notesInput.value;

  // Add Gemini analysis if available
  if (geminiAnalysis) {
    currentData.geminiAnalysis = geminiAnalysis;
  }

  // Save to Chrome storage
  chrome.storage.local.get(['submissions'], (result) => {
    const submissions = result.submissions || [];
    if (editingFromList && currentData.id) {
      const idx = submissions.findIndex(s => s.id === currentData.id);
      if (idx !== -1) {
        submissions[idx] = { ...submissions[idx], ...currentData };
      } else {
        // Fallback: add if not found
        submissions.unshift(currentData);
      }
      chrome.storage.local.set({ submissions }, () => {
        showMessage('Submission updated!');
      });
    } else {
      // Generate unique ID for new save
      currentData.id = Date.now().toString();
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
          geminiSection.style.display = 'none';
          currentData = null;
          geminiAnalysis = null;
        }, 1500);
      });
    }
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
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <strong>${sub.problemName}</strong>
            <button class="delete-btn" data-id="${sub.id}" title="Delete" style="padding:2px 6px; font-size:11px; line-height:1; background:#2a1e1e; color:#ef4743; border-radius:3px; border:none; cursor:pointer;">Delete</button>
          </div>
          <div style="font-size: 12px; color: #888; margin-top: 4px;">
            ${sub.language || 'Unknown'} • ${sub.status} • ${new Date(sub.timestamp).toLocaleDateString()}
          </div>
          ${sub.notes ? `<div style="font-size: 11px; color: #aaa; margin-top: 2px; font-style: italic;">${escapeHtml(sub.notes.substring(0, 50))}${sub.notes.length > 50 ? '...' : ''}</div>` : ''}
          ${sub.geminiAnalysis && sub.geminiAnalysis.topics ? `
            <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
              ${sub.geminiAnalysis.topics.slice(0, 3).map(topic => `<span class="topic-tag" style="font-size: 10px; padding: 2px 6px;">${escapeHtml(topic)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `).join('');
      
      // Add click handlers for viewing
      document.querySelectorAll('.submission-item').forEach(item => {
        item.addEventListener('click', (e) => {
          // Don't trigger if clicking delete button
          if (e.target.classList.contains('delete-btn')) return;
          
          const id = item.dataset.id;
          const submission = submissions.find(s => s.id === id);
          if (submission) {
            currentData = submission;
            geminiAnalysis = submission.geminiAnalysis || null;
            renderEditableForm(submission);
            notesInput.value = submission.notes || '';
            notesSection.style.display = 'block';
            saveSection.style.display = 'block';
            geminiSection.style.display = 'block';
            
            // Show Gemini results if available
            if (geminiAnalysis) {
              geminiResults.style.display = 'block';
              if (geminiAnalysis.topics && geminiAnalysis.topics.length > 0) {
                geminiTopics.innerHTML = geminiAnalysis.topics
                  .map(topic => `<span class="topic-tag">${escapeHtml(topic)}</span>`)
                  .join('');
              }
            } else {
              geminiResults.style.display = 'none';
            }
            
            editingFromList = true;
            saveBtn.textContent = 'Update Submission';
            submissionsList.style.display = 'none';
          }
        });
      });

      // Delete handlers
      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          if (!id) return;
          if (!confirm('Delete this submission?')) return;
          const remaining = submissions.filter(s => s.id !== id);
          chrome.storage.local.set({ submissions: remaining }, () => {
            showMessage('Submission deleted');
            // Refresh list view
            viewAllBtn.click();
          });
        });
      });
    }
    
    submissionsList.style.display = 'block';
    dataPreview.innerHTML = '';
    notesSection.style.display = 'none';
    saveSection.style.display = 'none';
    geminiSection.style.display = 'none';
  });
});

// ===== GEMINI INTEGRATION =====

// Analyze with Gemini
analyzeBtn.addEventListener('click', async () => {
  if (!currentData) {
    showMessage('No submission data to analyze', 'error');
    return;
  }

  await geminiAnalyzer.loadConfig();
  
  if (!geminiAnalyzer.isConfigured()) {
    showMessage('Please configure Gemini API first', 'error');
    configModal.style.display = 'block';
    return;
  }

  analyzeBtn.textContent = 'Analyzing...';
  analyzeBtn.disabled = true;

  try {
    geminiAnalysis = await geminiAnalyzer.analyzeSolution(currentData);
    
    // Display results
    geminiResults.style.display = 'block';
    
    // Display topics
    if (geminiAnalysis.topics && geminiAnalysis.topics.length > 0) {
      geminiTopics.innerHTML = geminiAnalysis.topics
        .map(topic => `<span class="topic-tag">${escapeHtml(topic)}</span>`)
        .join('');
    }

    showMessage('Analysis complete!');
  } catch (error) {
    console.error('Gemini analysis error:', error);
    showMessage('Analysis failed: ' + error.message, 'error');
  } finally {
    analyzeBtn.textContent = 'Analyze with Gemini';
    analyzeBtn.disabled = false;
  }
});

// View Gemini Solution
viewSolutionBtn.addEventListener('click', () => {
  if (!geminiAnalysis || !geminiAnalysis.optimalSolution) {
    showMessage('No solution available', 'error');
    return;
  }

  const solution = geminiAnalysis.optimalSolution;
  const comparison = geminiAnalysis.comparison;

  contentModalTitle.textContent = 'Gemini Optimal Solution';
  contentModalBody.innerHTML = `
    <div>
      <div style="margin-bottom: 16px;">
        <span class="complexity-badge">Time: ${escapeHtml(solution.timeComplexity)}</span>
        <span class="complexity-badge">Space: ${escapeHtml(solution.spaceComplexity)}</span>
      </div>
      
      ${comparison ? `
        <div style="margin-bottom: 16px; padding: 12px; background: #1a1a1a; border-radius: 6px;">
          <div style="font-size: 12px; color: #888; margin-bottom: 8px;">Your Solution:</div>
          <span class="complexity-badge" style="background: rgba(239, 71, 67, 0.15); color: #ef4743;">Time: ${escapeHtml(comparison.userTimeComplexity)}</span>
          <span class="complexity-badge" style="background: rgba(239, 71, 67, 0.15); color: #ef4743;">Space: ${escapeHtml(comparison.userSpaceComplexity)}</span>
        </div>
      ` : ''}
      
      <pre class="gemini-code">${escapeHtml(solution.code)}</pre>
      
      ${comparison && comparison.improvements && comparison.improvements.length > 0 ? `
        <div style="margin-top: 16px;">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #ffa116;">Key Improvements:</div>
          <ul style="margin-left: 20px; line-height: 1.6; font-size: 13px;">
            ${comparison.improvements.map(imp => `<li>${escapeHtml(imp)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
  
  contentModal.style.display = 'block';
});

// View Gemini Notes
viewNotesBtn.addEventListener('click', () => {
  if (!geminiAnalysis || !geminiAnalysis.notes) {
    showMessage('No notes available', 'error');
    return;
  }

  contentModalTitle.textContent = 'Gemini Analysis Notes';
  
  // Convert markdown to HTML (basic conversion)
  const notesHtml = convertMarkdownToHtml(geminiAnalysis.notes);
  
  contentModalBody.innerHTML = `
    <div style="line-height: 1.6; font-size: 13px;">
      ${notesHtml}
    </div>
    
    ${geminiAnalysis.comparison && geminiAnalysis.comparison.strengths && geminiAnalysis.comparison.strengths.length > 0 ? `
      <div style="margin-top: 20px; padding: 12px; background: rgba(0, 184, 122, 0.1); border-radius: 6px; border: 1px solid rgba(0, 184, 122, 0.3);">
        <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #00b77a;">What You Did Well:</div>
        <ul style="margin-left: 20px; line-height: 1.6; font-size: 13px;">
          ${geminiAnalysis.comparison.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}
    
    ${geminiAnalysis.comparison && geminiAnalysis.comparison.differences && geminiAnalysis.comparison.differences.length > 0 ? `
      <div style="margin-top: 12px; padding: 12px; background: rgba(255, 161, 22, 0.1); border-radius: 6px; border: 1px solid rgba(255, 161, 22, 0.3);">
        <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #ffa116;">Key Differences:</div>
        <ul style="margin-left: 20px; line-height: 1.6; font-size: 13px;">
          ${geminiAnalysis.comparison.differences.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}
  `;
  
  contentModal.style.display = 'block';
});

// Close content modal
closeContentBtn.addEventListener('click', () => {
  contentModal.style.display = 'none';
});

contentModal.addEventListener('click', (e) => {
  if (e.target === contentModal) {
    contentModal.style.display = 'none';
  }
});

// Config button
configBtn.addEventListener('click', async () => {
  await geminiAnalyzer.loadConfig();
  apiKeyInput.value = geminiAnalyzer.apiKey || '';
  configModal.style.display = 'block';
});

// Save config
saveConfigBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showMessage('Please enter API key', 'error');
    return;
  }
  
  await geminiAnalyzer.saveConfig(apiKey);
  configModal.style.display = 'none';
  showMessage('Configuration saved!');
});

// Cancel config
cancelConfigBtn.addEventListener('click', () => {
  configModal.style.display = 'none';
});

configModal.addEventListener('click', (e) => {
  if (e.target === configModal) {
    configModal.style.display = 'none';
  }
});

// Helper: Basic markdown to HTML converter
function convertMarkdownToHtml(markdown) {
  let html = escapeHtml(markdown);
  
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin-top: 16px; margin-bottom: 8px; font-size: 14px; color: #ffa116;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin-top: 16px; margin-bottom: 8px; font-size: 15px; color: #ffa116;">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="margin-top: 16px; margin-bottom: 8px; font-size: 16px; color: #ffa116;">$1</h2>');
  
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre class="gemini-code">$2</pre>');
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background: #1a1a1a; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 12px;">$1</code>');
  
  // Line breaks
  html = html.replace(/\n\n/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');
  
  return html;
}
// Popup script
let currentData = null;
let editingFromList = false;

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
      <div class="field-label">Code</div>
      <textarea id="codeInput">${escapeHtml(data.code || '')}</textarea>
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
  edited.code = get('codeInput')?.value || edited.code;
  return edited;
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
          renderEditableForm(currentData);
          notesSection.style.display = 'block';
          saveSection.style.display = 'block';
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
          currentData = null;
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
            <button class="delete-btn" data-id="${sub.id}" title="Delete" style="padding:2px 6px; font-size:11px; line-height:1; background:#2a1e1e; color:#ef4743; border-radius:3px;">Delete</button>
          </div>
          <div style="font-size: 12px; color: #888; margin-top: 4px;">
            ${sub.language || 'Unknown'} • ${sub.status} • ${new Date(sub.timestamp).toLocaleDateString()}
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
            renderEditableForm(submission);
            notesInput.value = submission.notes || '';
            notesSection.style.display = 'block';
            saveSection.style.display = 'block';
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
  });
});
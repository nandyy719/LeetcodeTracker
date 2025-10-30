// Content script to extract LeetCode submission data
class LeetCodeExtractor {
    constructor() {
      this.data = {};
      this.currentPath = window.location.pathname;
      this._pageVersion = 0;
      this._setupRouteObserversOnce();
    }
  
    // ==== __NEXT_DATA__ helpers (prefer these over DOM scraping when available) ====
    getNextData() {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return null;
      try {
        return JSON.parse(el.textContent);
      } catch (e) {
        return null;
      }
    }

    getProblemFromNextData() {
      const data = this.getNextData();
      if (!data) return null;
      const props = data.props || {};
      const pageProps = props.pageProps || {};
      const candidates = [
        pageProps.questionData,
        pageProps.question,
        pageProps.dehydratedState,
        pageProps
      ];
      for (const c of candidates) {
        if (!c) continue;
        if (c.title && c.content) return c;
        if (c.queries && Array.isArray(c.queries)) {
          for (const q of c.queries) {
            const v = q && q.state && q.state.data;
            if (v && v.question && v.question.content) return v.question;
            if (v && v.content && v.title) return v;
          }
        }
        if (c.question && c.question.content) return c.question;
      }
      return null;
    }

    getSubmissionFromNextData() {
      const data = this.getNextData();
      if (!data) return null;
      const props = data.props || {};
      const pageProps = props.pageProps || {};
      const candidates = [
        pageProps.submissionDetails,
        pageProps.submissionData,
        pageProps.dehydratedState
      ];
      for (const c of candidates) {
        if (!c) continue;
        if (c.code || c.submissionCode) {
          return {
            code: c.code || c.submissionCode,
            lang: c.lang || c.language || c.langSlug
          };
        }
        if (c.queries && Array.isArray(c.queries)) {
          for (const q of c.queries) {
            const v = q && q.state && q.state.data;
            const s = v && (v.submissionDetails || v);
            if (s && (s.code || s.submissionCode)) {
              return {
                code: s.code || s.submissionCode,
                lang: s.lang || s.language || s.langSlug
              };
            }
          }
        }
      }
      return null;
    }

    // Wait for SPA hydration/navigation to settle before extracting
    async waitForPageStability(timeoutMs = 5000) {
      const start = Date.now();
      const hasReadySignals = () => {
        const next = this.getNextData();
        const problem = this.getProblemFromNextData();
        const submission = this.getSubmissionFromNextData();
        const monaco = document.querySelector('.monaco-editor');
        return !!(next && (problem || submission)) || !!monaco;
      };
      while (Date.now() - start < timeoutMs) {
        if (hasReadySignals()) return true;
        await new Promise(r => setTimeout(r, 200));
      }
      return false;
    }

    // Observe route changes in SPA and update currentPath
    _setupRouteObserversOnce() {
      if (this._routeObserverInstalled) return;
      this._routeObserverInstalled = true;
      const self = this;
      const _pushState = history.pushState;
      const _replaceState = history.replaceState;
      history.pushState = function() {
        const ret = _pushState.apply(this, arguments);
        self.currentPath = window.location.pathname;
        self._pageVersion++;
        self.data = {};
        return ret;
      };
      history.replaceState = function() {
        const ret = _replaceState.apply(this, arguments);
        self.currentPath = window.location.pathname;
        self._pageVersion++;
        self.data = {};
        return ret;
      };
      window.addEventListener('popstate', () => {
        self.currentPath = window.location.pathname;
        self._pageVersion++;
        self.data = {};
      });
    }

    // Prefer Monaco API when available, then DOM fallback
    getMonacoCodeSafely() {
      try {
        if (window.monaco && window.monaco.editor) {
          if (typeof window.monaco.editor.getEditors === 'function') {
            const editors = window.monaco.editor.getEditors();
            for (const ed of editors) {
              try {
                const dom = ed.getDomNode && ed.getDomNode();
                if (!dom || !document.contains(dom)) continue;
                const model = ed.getModel && ed.getModel();
                if (model) {
                  const v = model.getValue();
                  if (v && v.trim().length > 0) return v;
                }
              } catch (e) {}
            }
          }
          if (typeof window.monaco.editor.getModels === 'function') {
            const models = window.monaco.editor.getModels();
            if (models && models.length) {
              for (const m of models) {
                const v = m.getValue();
                if (v && v.trim().length > 0) return v;
              }
            }
          }
        }
      } catch (e) {}
      // DOM fallback stitched lines
      const monacoEditor = document.querySelector('.monaco-editor');
      if (!monacoEditor) return null;
      const viewLines = monacoEditor.querySelector('.view-lines');
      if (!viewLines) return null;
      const lineElements = Array.from(viewLines.querySelectorAll('.view-line'));
      const linesWithNumbers = [];
      for (const line of lineElements) {
        const topStyle = line.style.top;
        if (topStyle) {
          const topPx = parseInt(topStyle);
          const lineText = line.innerText || line.textContent || '';
          linesWithNumbers.push({ top: topPx, text: lineText });
        }
      }
      linesWithNumbers.sort((a, b) => a.top - b.top);
      const stitched = linesWithNumbers.map(item => item.text).join('\n');
      return stitched && stitched.trim().length ? stitched : null;
    }

    // Wait for element to appear in DOM
    waitForElement(selector, timeout = 5000) {
      return new Promise((resolve, reject) => {
        if (document.querySelector(selector)) {
          return resolve(document.querySelector(selector));
        }
  
        const observer = new MutationObserver(() => {
          if (document.querySelector(selector)) {
            observer.disconnect();
            resolve(document.querySelector(selector));
          }
        });
  
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
  
        setTimeout(() => {
          observer.disconnect();
          reject(new Error('Timeout waiting for element'));
        }, timeout);
      });
    }
  
    // Extract problem name from the page title or heading
    extractProblemName() {
      // Try multiple selectors
      const selectors = [
        'a[href*="/problems/"]',
        '.text-title-large',
        '[class*="text-title"]',
        'h1',
        'h2',
        'h3'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          const text = element.textContent.trim();
          // Extract number and name pattern like "17. Letter Combinations of a Phone Number"
          const match = text.match(/^\d+\.\s*(.+)$/) || text.match(/^(.+)$/);
          if (match) {
            return match[1].trim();
          }
        }
      }
      
      // Fallback: extract from URL
      const urlMatch = window.location.pathname.match(/\/problems\/([^\/]+)\//);
      if (urlMatch) {
        return urlMatch[1].split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      }
      
      return 'Unknown Problem';
    }
  
    // Extract difficulty - may not be visible on submission page
    extractDifficulty() {
      // 1) Prefer __NEXT_DATA__ anywhere in payload
      const data = this.getNextData();
      const isDiff = (v) => typeof v === 'string' && /^(Easy|Medium|Hard)$/i.test(v.trim());
      const scanObj = (o, depth = 0) => {
        if (!o || typeof o !== 'object' || depth > 6) return null; // cap depth
        if (Array.isArray(o)) {
          for (const it of o) {
            const r = scanObj(it, depth + 1);
            if (r) return r;
          }
          return null;
        }
        // direct property named difficulty
        if (Object.prototype.hasOwnProperty.call(o, 'difficulty') && isDiff(o.difficulty)) {
          return o.difficulty;
        }
        for (const k of Object.keys(o)) {
          const v = o[k];
          const r = scanObj(v, depth + 1);
          if (r) return r;
        }
        return null;
      };
      const diffFromNext = scanObj(data || {});
      if (diffFromNext) return diffFromNext;

      // 2) DOM heuristic: look for a visible badge near the title
      const titleEl = document.querySelector('h1[data-cypress="QuestionTitle"], h1, h2');
      const container = titleEl ? titleEl.closest('div') || document.body : document.body;
      const candidates = container.querySelectorAll('[data-difficulty], [class*="difficulty"], [class*="Difficulty"], span, div');
      for (const el of candidates) {
        const text = (el.textContent || '').trim();
        if (/^(Easy|Medium|Hard)$/i.test(text)) {
          // ensure element is visible
          const style = window.getComputedStyle(el);
          if (style && style.display !== 'none' && style.visibility !== 'hidden') {
            return text;
          }
        }
      }

      return 'Unknown';
    }
  
    // Extract programming language
    extractLanguage() {
      console.log('Extracting language...');
      
      // Method 1: Look in the code editor area for language label
      const allText = document.body.innerText;
      console.log('Page text sample:', allText.substring(0, 500));
      
      // Look for "Code" tab section which shows language
      const codeSection = document.querySelector('[class*="Code"]') || 
                          document.querySelector('[id*="code"]');
      
      if (codeSection) {
        console.log('Found code section:', codeSection.innerText.substring(0, 200));
      }
      
      // Method 2: Check all buttons and spans for language names
      const languagePattern = /^(Python|Python3|Java|JavaScript|C\+\+|C|C#|Ruby|Go|Rust|Swift|Kotlin|TypeScript|PHP|Scala|cpp|js|py)$/i;
      const allButtons = document.querySelectorAll('button, span, div[class*="text"]');
      
      for (const element of allButtons) {
        const text = element.textContent.trim();
        if (languagePattern.test(text)) {
          console.log('Found language:', text);
          // Normalize language names
          if (text.toLowerCase() === 'cpp') return 'C++';
          if (text.toLowerCase() === 'js') return 'JavaScript';
          if (text.toLowerCase() === 'py') return 'Python';
          return text;
        }
      }
      
      // Method 3: Look for language in URL or page metadata
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('lang')) {
        return urlParams.get('lang');
      }
      
      // Method 4: Check the actual visible text near "Code" for language
      const bodyText = document.body.textContent;
      const languages = ['Python3', 'Python', 'Java', 'JavaScript', 'C++', 'C', 'C#', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin', 'TypeScript', 'PHP', 'Scala'];
      
      for (const lang of languages) {
        // Look for language name that appears near "Code" or "Solution"
        const regex = new RegExp(`(Code|Solution)\\s+${lang}`, 'i');
        if (regex.test(bodyText)) {
          return lang;
        }
        // Or just if language appears prominently
        const regex2 = new RegExp(`^${lang}$`, 'm');
        if (regex2.test(bodyText)) {
          return lang;
        }
      }
      
      console.log('Language not found');
      return 'Unknown';
    }
  
    // Extract submission code from Monaco editor
    async extractCode() {
      console.log('Extracting code...');
      
      // Prefer Monaco API when available
      const monacoApiValue = this.getMonacoCodeSafely();
      if (monacoApiValue && monacoApiValue.length > 10) {
        console.log('Got code from Monaco API / stitched DOM, length:', monacoApiValue.length);
        return monacoApiValue;
      }

      // Find Monaco editor
      const monacoEditor = document.querySelector('.monaco-editor');
      if (!monacoEditor) {
        console.log('Monaco editor not found');
        return 'Code not found';
      }

      // Method 1: Try to get code by programmatically selecting all and reading selection
      const editorTextArea = monacoEditor.querySelector('textarea');
      if (editorTextArea) {
        console.log('Found editor textarea, trying to select all...');
        
        // Store current focus
        const previouslyFocused = document.activeElement;
        
        // Focus the textarea
        editorTextArea.focus();
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Trigger Ctrl+A programmatically
        editorTextArea.select();
        
        // Try multiple ways to select all
        try {
          // Method 1a: Use execCommand
          document.execCommand('selectAll', false, null);
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
          console.log('execCommand failed, trying keyboard event');
        }
        
        // Method 1b: Dispatch keyboard event for Ctrl+A
        const selectAllEvent = new KeyboardEvent('keydown', {
          key: 'a',
          code: 'KeyA',
          ctrlKey: true,
          metaKey: true, // For Mac
          bubbles: true,
          cancelable: true
        });
        editorTextArea.dispatchEvent(selectAllEvent);
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Now try to read the value from textarea
        const textAreaValue = editorTextArea.value;
        if (textAreaValue && textAreaValue.length > 10) {
          console.log('Got code from textarea.value, length:', textAreaValue.length);
          // Restore focus
          if (previouslyFocused) previouslyFocused.focus();
          return textAreaValue;
        }
        
        // Try to get selection
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString() : '';
        if (selectedText && selectedText.length > 10) {
          console.log('Got code from window selection, length:', selectedText.length);
          selection.removeAllRanges();
          if (previouslyFocused) previouslyFocused.focus();
          return selectedText;
        }
        
        // Restore focus
        if (previouslyFocused) previouslyFocused.focus();
      }
      
      // Method 2: Use data-mode-id to find the correct lines in order
      console.log('Trying to extract using line numbers for ordering...');
      const viewLines = monacoEditor.querySelector('.view-lines');
      if (viewLines) {
        const lineElements = Array.from(viewLines.querySelectorAll('.view-line'));
        console.log('Found view-line elements:', lineElements.length);
        
        // Try to get lines with their line numbers for proper ordering
        const linesWithNumbers = [];
        
        for (const line of lineElements) {
          // Get the line number from the top position or data attribute
          const topStyle = line.style.top;
          if (topStyle) {
            const topPx = parseInt(topStyle);
            const lineText = line.innerText || line.textContent || '';
            linesWithNumbers.push({ top: topPx, text: lineText });
          }
        }
        
        // Sort by top position
        linesWithNumbers.sort((a, b) => a.top - b.top);
        const sortedCode = linesWithNumbers.map(item => item.text).join('\n');
        
        if (sortedCode.length > 10) {
          console.log('Got code sorted by position, length:', sortedCode.length);
          console.log('First 200 chars:', sortedCode.substring(0, 200));
          return sortedCode;
        }
      }
      
      // Method 3: Try line-numbers container to help with ordering
      const lineNumbersContainer = monacoEditor.querySelector('.line-numbers');
      if (lineNumbersContainer && viewLines) {
        console.log('Trying to match line numbers with content...');
        const lineNumberElements = Array.from(lineNumbersContainer.querySelectorAll('[class*="line-numbers"]'));
        const lineContentElements = Array.from(viewLines.querySelectorAll('.view-line'));
        
        console.log('Line numbers found:', lineNumberElements.length);
        console.log('Line content found:', lineContentElements.length);
        
        // Build a map of line number to content
        const lineMap = new Map();
        
        for (const lineContent of lineContentElements) {
          const topStyle = lineContent.style.top;
          if (topStyle) {
            const topPx = parseInt(topStyle);
            const text = lineContent.innerText || lineContent.textContent || '';
            lineMap.set(topPx, text);
          }
        }
        
        // Sort by position and join
        const sortedLines = Array.from(lineMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(entry => entry[1]);
        
        const code = sortedLines.join('\n');
        if (code.length > 10) {
          console.log('Got code using position mapping, length:', code.length);
          return code;
        }
      }
      
      console.log('All methods failed to extract code');
      return 'Code extraction failed - Monaco editor may be using virtualization';
    }
  
    // Extract submission status (Accepted, Wrong Answer, etc.)
    extractStatus() {
      // Look for status text
      const bodyText = document.body.textContent;
      
      // Check for "Accepted" with testcases
      if (bodyText.includes('Accepted')) {
        return 'Accepted';
      }
      
      // Check for other statuses
      const statuses = [
        'Wrong Answer',
        'Time Limit Exceeded',
        'Runtime Error',
        'Memory Limit Exceeded',
        'Compile Error',
        'Output Limit Exceeded'
      ];
      
      for (const status of statuses) {
        if (bodyText.includes(status)) {
          return status;
        }
      }
      
      return 'Unknown';
    }
  
    // Extract test case results
    extractTestCases() {
      console.log('Extracting test cases...');
      const bodyText = document.body.textContent;
      
      // Method 1: Look for "X/Y testcases passed" pattern (case insensitive, flexible whitespace)
      const patterns = [
        /(\d+)\s*\/\s*(\d+)\s+testcases?\s+passed/i,
        /(\d+)\s*\/\s*(\d+)\s+test\s+cases?\s+passed/i,
        /Accepted\s+(\d+)\s*\/\s*(\d+)/i,
        /(\d+)\s+out\s+of\s+(\d+)\s+test\s+cases?\s+passed/i
      ];
      
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) {
          console.log('Found test cases with pattern:', pattern, 'Values:', match[1], match[2]);
          return {
            passed: parseInt(match[1]),
            total: parseInt(match[2])
          };
        }
      }
      
      // Method 2: Look in specific elements
      const allDivs = document.querySelectorAll('div, span');
      for (const div of allDivs) {
        const text = div.textContent;
        const match = text.match(/(\d+)\s*\/\s*(\d+)/);
        if (match && text.toLowerCase().includes('test')) {
          console.log('Found test cases in div:', text);
          return {
            passed: parseInt(match[1]),
            total: parseInt(match[2])
          };
        }
      }
      
      console.log('Test cases not found');
      return { passed: 0, total: 0 };
    }
  
    // Extract runtime and memory stats
    extractPerformance() {
      const stats = {
        runtime: null,
        memory: null,
        runtimePercentile: null,
        memoryPercentile: null
      };
  
      const bodyText = document.body.textContent;
      
      // Extract runtime (e.g., "2 ms")
      const runtimeMatch = bodyText.match(/Runtime\s*\n*\s*(\d+(?:\.\d+)?)\s*(ms|s)/i);
      if (runtimeMatch) {
        stats.runtime = `${runtimeMatch[1]} ${runtimeMatch[2]}`;
      }
      
      // Extract runtime percentile (e.g., "Beats 36.48%")
      const runtimePercentileMatch = bodyText.match(/Runtime.*?Beats\s+(\d+(?:\.\d+)?)\s*%/is);
      if (runtimePercentileMatch) {
        stats.runtimePercentile = `${runtimePercentileMatch[1]}%`;
      }
      
      // Extract memory (e.g., "42.19 MB")
      const memoryMatch = bodyText.match(/Memory\s*\n*\s*(\d+(?:\.\d+)?)\s*(MB|KB|GB)/i);
      if (memoryMatch) {
        stats.memory = `${memoryMatch[1]} ${memoryMatch[2]}`;
      }
      
      // Extract memory percentile
      const memoryPercentileMatch = bodyText.match(/Memory.*?Beats\s+(\d+(?:\.\d+)?)\s*%/is);
      if (memoryPercentileMatch) {
        stats.memoryPercentile = `${memoryPercentileMatch[1]}%`;
      }
  
      return stats;
    }
  
    // Main extraction method
    async extractAllData() {
      try {
        console.log('=== Starting extraction ===');
        const startVersion = this._pageVersion;
        // Wait a bit for the page to fully load
        await new Promise(resolve => setTimeout(resolve, 800));
        await this.waitForPageStability(5000);

        // First, try pulling from Next.js data payload
        let problem = this.getProblemFromNextData();
        let submission = this.getSubmissionFromNextData();

        let assembled = {
          problemName: (problem && problem.title) || this.extractProblemName(),
          difficulty: (problem && problem.difficulty) || this.extractDifficulty(),
          language: (submission && (submission.lang)) || this.extractLanguage(),
          code: (submission && submission.code) || await this.extractCode(),
          status: this.extractStatus(),
          testCases: this.extractTestCases(),
          performance: this.extractPerformance(),
          url: window.location.href,
          timestamp: new Date().toISOString(),
          notes: '',
          tags: Array.isArray(problem && problem.topicTags) ? problem.topicTags.map(t => t.name) : [],
          descriptionHTML: (problem && problem.content) || null
        };

        // Quick retry if key fields look incomplete (SPA not yet hydrated fully)
        const looksIncomplete = () => {
          const unknownDiff = !assembled.difficulty || /Unknown/i.test(assembled.difficulty);
          const nameFromUrl = assembled.problemName === 'Unknown Problem';
          const emptyDesc = !assembled.descriptionHTML;
          return unknownDiff || nameFromUrl || emptyDesc;
        };
        if (looksIncomplete()) {
          console.log('Data looks incomplete; retrying after brief delay...');
          await new Promise(r => setTimeout(r, 600));
          if (this._pageVersion !== startVersion) {
            console.log('Route changed during extraction, restarting.');
            return this.extractAllData();
          }
          await this.waitForPageStability(3000);
          problem = this.getProblemFromNextData() || problem;
          submission = this.getSubmissionFromNextData() || submission;
          assembled.problemName = (problem && problem.title) || assembled.problemName;
          assembled.difficulty = (problem && problem.difficulty) || assembled.difficulty;
          assembled.tags = Array.isArray(problem && problem.topicTags) ? problem.topicTags.map(t => t.name) : assembled.tags;
          assembled.descriptionHTML = (problem && problem.content) || assembled.descriptionHTML;
          if (!submission || !submission.code) {
            // Try to refresh Monaco-stored code too
            const monacoCode = this.getMonacoCodeSafely();
            if (monacoCode && monacoCode.length > 10) assembled.code = monacoCode;
          }
        }

        if (this._pageVersion !== startVersion) {
          console.log('Route changed after assembling data, restarting.');
          return this.extractAllData();
        }

        this.data = assembled;
  
        console.log('=== Extracted data ===', this.data);
        return this.data;
      } catch (error) {
        console.error('Error extracting data:', error);
        return null;
      }
    }
  }
  
  // Initialize extractor
  const extractor = new LeetCodeExtractor();
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractData') {
      extractor.extractAllData().then(data => {
        sendResponse({ success: true, data });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep the message channel open for async response
    }
    
    if (request.action === 'saveSubmission') {
      // Save to storage
      chrome.storage.local.get(['submissions'], (result) => {
        const submissions = result.submissions || [];
        submissions.push(request.data);
        
        chrome.storage.local.set({ submissions }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
    }
  });
  
  // Debug helper - log page structure when loaded
  if (window.location.pathname.includes('/submissions/')) {
    console.log('LeetCode Tracker: On submission page');
    setTimeout(() => {
      console.log('=== DEBUG: Page Structure ===');
      console.log('Monaco editor present?', !!document.querySelector('.monaco-editor'));
      console.log('View lines present?', !!document.querySelector('.view-lines'));
      console.log('View line count:', document.querySelectorAll('.view-line').length);
    }, 3000);
  }
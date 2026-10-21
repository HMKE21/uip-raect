# AI in the MyPC editor — frontend (cumulative: step 1 + step 2)

Copy `src/` over the project's `src/`.

Step 1 (explain / fix error): ai/*, SandboxPanel, RunPanel, useSandbox, zip-ai-fix.css
Step 2 (right-click menu on selected code): CodeEditor.jsx (onContext), ai/useAiFix.js (/assist),
  ai/AiFixPanel.jsx (titles, Copy / New file), ai/aiFixUtils.js (suggestFileName), ZipWorkbench.jsx, zip-ai-fix.css

Needs backend: POST /api/v1/ai-code/assist (uip-laravel-ai-code-backend.zip).
Tests: node --test src/components/zipbench/ai/__tests__/aiFixUtils.test.js

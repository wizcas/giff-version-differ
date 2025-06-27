"use client";

import { useState } from "react";

export default function Home() {
  const [repo, setRepo] = useState("");
  const [fromRef, setFromRef] = useState("");
  const [toRef, setToRef] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [excludeSubPaths, setExcludeSubPaths] = useState("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [urlCopied, setUrlCopied] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState("");
  const [streamProgress, setStreamProgress] = useState("");
  const [streamCommits, setStreamCommits] = useState([]);
  const [streamSummary, setStreamSummary] = useState(null);

  // Generate dynamic API URL for documentation
  const generateApiUrl = () => {
    const baseUrl = "/api/git-diff";
    const params = new URLSearchParams();

    // Required parameters - use placeholder if empty
    const repoValue = repo || "https://github.com/owner/repository";
    const fromValue = fromRef || "v1.0.0";
    const toValue = toRef || "v2.0.0";

    params.append("repo", repoValue);
    params.append("from", fromValue);
    params.append("to", toValue); // Optional parameters - only add if they have values
    if (targetDir.trim()) {
      params.append("targetDir", targetDir);
    }
    if (excludeSubPaths.trim()) {
      params.append("excludeSubPaths", excludeSubPaths);
    }
    if (token.trim()) {
      params.append("token", token);
    }

    return `${baseUrl}?${params.toString()}`;
  };

  // Check if required field is using placeholder value
  const isPlaceholder = (value, placeholder) => {
    return !value || value === placeholder;
  };
  // Copy URL to clipboard
  const copyUrlToClipboard = async () => {
    const fullUrl =
      typeof window !== "undefined" ? `${window.location.origin}${generateApiUrl()}` : `http://localhost:3000${generateApiUrl()}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  // Import URL and fill form
  const handleImportUrl = () => {
    setImportError("");
    try {
      let urlToParse = importUrl.trim();

      // Handle both full URLs and just the query string
      if (urlToParse.includes("?")) {
        // Extract just the query part
        const urlObj = new URL(urlToParse.startsWith("http") ? urlToParse : `http://localhost:3000${urlToParse}`);
        const params = urlObj.searchParams;

        // Fill in the form fields
        if (params.get("repo")) setRepo(decodeURIComponent(params.get("repo")));
        if (params.get("from")) setFromRef(decodeURIComponent(params.get("from")));
        if (params.get("to")) setToRef(decodeURIComponent(params.get("to")));
        if (params.get("targetDir")) setTargetDir(decodeURIComponent(params.get("targetDir")));
        if (params.get("excludeSubPaths")) setExcludeSubPaths(decodeURIComponent(params.get("excludeSubPaths")));
        if (params.get("token")) setToken(decodeURIComponent(params.get("token")));

        // Close modal and clear import fields
        setShowImportModal(false);
        setImportUrl("");
        setImportError("");
      } else {
        setImportError("Invalid URL format. Please paste a complete URL with parameters.");
      }
    } catch (err) {
      setImportError("Failed to parse URL. Please check the format and try again.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setStreamProgress("Starting...");
    setStreamCommits([]);
    setStreamSummary(null);

    try {
      const params = new URLSearchParams({
        repo,
        from: fromRef,
        to: toRef,
      });

      // Add optional parameters only if they have values
      if (targetDir.trim()) {
        params.append("targetDir", targetDir);
      }
      if (excludeSubPaths.trim()) {
        params.append("excludeSubPaths", excludeSubPaths);
      }
      if (token.trim()) {
        params.append("token", token);
      }

      // Use streaming API
      const response = await fetch(`/api/git-diff/stream?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let allCommits = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          try {
            const data = JSON.parse(trimmedLine);

            switch (data.type) {
              case "start":
                setStreamProgress(`Started analyzing ${data.repoUrl}...`);
                break;

              case "progress":
                setStreamProgress(data.status);
                break;

              case "commits":
                allCommits = allCommits.concat(data.commits);
                setStreamCommits([...allCommits]);
                setStreamProgress(`Processing commits: ${data.progress.processed}/${data.progress.total}`);
                break;

              case "complete":
                setStreamProgress("Analysis complete!");
                setStreamSummary({
                  totalCommits: data.totalCommits,
                  elapsedTime: data.elapsedTime,
                  fetchStats: data.fetchStats, // Add fetch statistics
                  apiUsed: data.apiUsed,
                  success: true,
                });
                // Convert to old result format for compatibility
                setResult({
                  success: true,
                  commits: allCommits,
                  totalCommits: data.totalCommits,
                  elapsedTime: data.elapsedTime,
                  fetchStats: data.fetchStats,
                  apiUsed: data.apiUsed,
                  repository: data.repository,
                  fromRef: data.fromRef,
                  toRef: data.toRef,
                  fromSha: data.fromSha,
                  toSha: data.toSha,
                });
                setLoading(false); // Immediately set loading to false when complete
                break;

              case "error":
                throw new Error(`API Error: ${data.error}`);

              default:
                console.log(`Unknown event type: ${data.type}`);
            }
          } catch (parseError) {
            console.warn(`Failed to parse streaming response line:`, parseError);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.type === "error") {
            throw new Error(`API Error: ${data.error}`);
          }
        } catch (parseError) {
          console.warn(`Failed to parse final buffer:`, parseError);
        }
      }
    } catch (err) {
      setError("Failed to fetch commits: " + err.message);
      setStreamProgress("Error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-600/10 to-orange-600/10"></div>
        <div className="relative container mx-auto px-4 py-8 text-center">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center justify-center p-2 bg-amber-100 dark:bg-amber-900 rounded-full mb-6">
              <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent mb-6">
              Git Version Differ
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Analyze and compare commits between Git tags or commit hashes from GitHub repositories with ease
            </p>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Main Form Card */}
        <div className="animate-fade-in-up bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 mb-8 border border-white/20 mx-auto max-w-4xl">
          {" "}
          <div className="text-center mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1"></div>
              <div className="flex-1 text-center">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Analyze Git Commits</h2>
              </div>
              <div className="flex-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors duration-200"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                    />
                  </svg>
                  Import URL
                </button>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-400">Compare commits between two Git references</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-3">
              <label htmlFor="repo" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                GitHub Repository URL
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                </div>
                <input
                  type="url"
                  id="repo"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  className="w-full pl-12 pr-4 py-4 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label htmlFor="from" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  From Reference
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    id="from"
                    value={fromRef}
                    onChange={(e) => setFromRef(e.target.value)}
                    placeholder="v1.0.0 or commit hash"
                    className="w-full pl-12 pr-4 py-4 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label htmlFor="to" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  To Reference
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    id="to"
                    value={toRef}
                    onChange={(e) => setToRef(e.target.value)}
                    placeholder="v2.0.0 or commit hash"
                    className="w-full pl-12 pr-4 py-4 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200"
                    required
                  />
                </div>
              </div>
            </div>
            {/* Optional Fields */}
            <div className="space-y-6">
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
                    />
                  </svg>
                  Optional Parameters
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label htmlFor="targetDir" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Target Directory
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2v0"
                          />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="targetDir"
                        value={targetDir}
                        onChange={(e) => setTargetDir(e.target.value)}
                        placeholder="src/"
                        className="w-full pl-12 pr-4 py-4 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="excludeSubPaths" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Exclude Sub Paths
                      <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">(comma-separated)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"
                          />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="excludeSubPaths"
                        value={excludeSubPaths}
                        onChange={(e) => setExcludeSubPaths(e.target.value)}
                        placeholder="node_modules,dist,build"
                        className="w-full pl-12 pr-4 py-4 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200"
                      />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Enter comma-separated paths relative to target directory. Example:{" "}
                      <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">dist,build,tests/fixtures</code>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="space-y-3">
                    <label htmlFor="token" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      GitHub Token
                      <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">(for private repositories)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                          />
                        </svg>
                      </div>
                      <input
                        id="token"
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full pl-12 pr-4 py-4 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full relative overflow-hidden bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-semibold py-4 px-6 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            >
              {loading && (
                <div className="absolute inset-0 bg-white/20 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <span className={loading ? "opacity-0" : "opacity-100"}>{loading ? "Analyzing Commits..." : "🚉 Stream Analysis"}</span>
            </button>{" "}
          </form>
        </div>

        {/* Import URL Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Import URL</h3>
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportUrl("");
                      setImportError("");
                    }}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="p-6">
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  Paste a previously generated API URL or complete URL to automatically fill the form fields.
                </p>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="importUrl" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      URL to Import
                    </label>
                    <textarea
                      id="importUrl"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="http://localhost:3000/api/git-diff?repo=https://github.com/owner/repo&from=v1.0.0&to=v2.0.0..."
                      className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all duration-200 min-h-[100px] resize-y"
                      required
                    />
                  </div>
                  {importError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                      {importError}
                    </div>
                  )}
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <h4 className="text-amber-800 dark:text-amber-300 font-semibold text-sm mb-2">Supported formats:</h4>
                    <ul className="text-amber-700 dark:text-amber-300 text-xs space-y-1">
                      <li>
                        • Complete URL:{" "}
                        <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">http://localhost:3000/api/git-diff?repo=...</code>
                      </li>
                      <li>
                        • API path only: <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">/api/git-diff?repo=...</code>
                      </li>
                      <li>• Any URL containing git-diff parameters</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportUrl("");
                    setImportError("");
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportUrl}
                  disabled={!importUrl.trim()}
                  className="px-6 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:from-slate-300 disabled:to-slate-400 text-white font-semibold rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                >
                  Import & Fill Form
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="animate-fade-in bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-6 py-4 rounded-xl mb-8 backdrop-blur-sm">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <div>
                <strong className="font-semibold">Error:</strong> {error}
              </div>
            </div>
          </div>
        )}

        {/* Real-time Progress Section */}
        {(loading || streamProgress) && (
          <div className="animate-fade-in bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden max-w-6xl mx-auto mb-8">
            {/* Progress Header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 px-8 py-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 flex items-center">
                {loading ? (
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3"></div>
                ) : (
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {loading ? "Analyzing Repository..." : "Analysis Complete"}
              </h2>
            </div>

            <div className="p-8">
              {/* Progress Status */}
              <div className="mb-6">
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Status</div>
                <div className="text-lg text-slate-900 dark:text-slate-100 font-medium">{streamProgress || "Initializing..."}</div>
              </div>

              {/* Streaming Commits Preview */}
              {streamCommits.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center">
                      <svg
                        className="w-5 h-5 text-slate-600 dark:text-slate-400 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Live Commits ({streamCommits.length})
                    </h3>
                    {streamSummary && (
                      <div className="text-sm text-slate-600 dark:text-slate-400">Completed in {streamSummary.elapsedTime}</div>
                    )}
                  </div>

                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
                    {streamCommits
                      .slice(-5)
                      .reverse()
                      .map((commit, index) => (
                        <div
                          key={commit.fullHash || commit.hash || index}
                          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition-all duration-200"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-3">
                              <code className="bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 px-2 py-1 rounded text-xs font-mono">
                                {commit.hash || commit.fullHash?.substring(0, 7) || "unknown"}
                              </code>
                              <span className="text-slate-600 dark:text-slate-400 text-sm">{commit.author || "Unknown Author"}</span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-500">
                              {commit.date ? new Date(commit.date).toLocaleDateString() : ""}
                            </div>
                          </div>
                          <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed">
                            {commit.cleanMessage || commit.message || "No message"}
                          </div>
                          {commit.semverType && (
                            <div className="mt-2">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  commit.semverType === "major"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                                    : commit.semverType === "minor"
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
                                    : commit.semverType === "patch" || commit.semverType === "fix"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                                    : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300"
                                }`}
                              >
                                {commit.semverType}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>

                  {streamCommits.length > 5 && (
                    <div className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
                      Showing latest 5 of {streamCommits.length} commits
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div className="animate-fade-in bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden max-w-6xl mx-auto">
            {/* Results Header */}
            <div className="bg-gradient-to-r from-green-50 to-amber-50 dark:from-green-900/20 dark:to-amber-900/20 px-8 py-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Analysis Results
              </h2>
            </div>

            <div className="p-8">
              {/* Repository Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-600/20 dark:to-orange-700/20 p-4 rounded-xl border border-amber-200 dark:border-amber-500">
                  <div className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">Repository</div>
                  <div className="font-mono text-sm text-slate-900 dark:text-slate-100">
                    {result.repository.owner}/{result.repository.repo}
                  </div>
                  <div className="mt-2 mb-1 opacity-80 text-xs text-orange-600 dark:text-orange-400">Range</div>
                  <div className="font-mono text-xs text-slate-900 dark:text-slate-100 flex flex-col">
                    <span>{result.fromRef}</span>
                    <span className="text-amber-500/50 text-xl">→</span>
                    <span>{result.toRef}</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 rounded-xl border border-green-200 dark:border-green-800">
                  <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">Total Commits</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{result.totalCommits}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">API Method</div>
                  <div className="flex items-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        result.apiUsed === "graphql"
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                      }`}
                    >
                      {result.apiUsed === "graphql" ? "⚡ GraphQL" : "🔗 REST"}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Execution Time</div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{result.elapsedTime}</div>
                </div>
              </div>

              {/* Fetch Statistics - Show only for GraphQL API with fetch stats */}
              {result.fetchStats && result.fetchStats.totalChecked > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800 mb-6">
                  <div className="flex items-center mb-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">API Efficiency</h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-blue-600 dark:text-blue-400 font-medium">Commits Checked</div>
                      <div className="text-slate-900 dark:text-slate-100 font-semibold">{result.fetchStats.totalChecked || "N/A"}</div>
                    </div>
                    <div>
                      <div className="text-blue-600 dark:text-blue-400 font-medium">API Requests</div>
                      <div className="text-slate-900 dark:text-slate-100 font-semibold">{result.fetchStats.requestCount || "N/A"}</div>
                    </div>
                    <div>
                      <div className="text-blue-600 dark:text-blue-400 font-medium">Fetch Time</div>
                      <div className="text-slate-900 dark:text-slate-100 font-semibold">{result.fetchStats.fetchTime || "N/A"}</div>
                    </div>
                  </div>
                  {result.fetchStats.totalChecked && result.totalCommits && (
                    <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        Efficiency: {result.totalCommits} returned / {result.fetchStats.totalChecked} checked ={" "}
                        {Math.round((result.totalCommits / result.fetchStats.totalChecked) * 100)}% efficiency
                        {result.fetchStats.totalChecked > result.totalCommits * 2 && (
                          <span className="text-amber-600 dark:text-amber-400 ml-2">
                            ⚠️ Consider using smaller date ranges for better performance
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Commits List */}
              {result.commits && result.commits.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center">
                    <svg className="w-5 h-5 text-slate-600 dark:text-slate-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    Commit History ({result.commits.length})
                  </h3>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
                    {result.commits.map((commit, index) => (
                      <div
                        key={index}
                        className="group bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6 hover:shadow-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <code className="text-sm bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1 rounded-lg font-mono group-hover:bg-slate-300 dark:group-hover:bg-slate-600 transition-colors">
                            {commit.hash.substring(0, 7)}
                          </code>
                          <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            {new Date(commit.date).toLocaleDateString()}
                          </div>
                        </div>
                        <p className="font-medium text-slate-900 dark:text-slate-100 mb-3 leading-relaxed text-xs font-mono">
                          {commit.message}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                            {commit.author}
                          </div>
                          <div className="flex items-center space-x-2">
                            {commit.semverType && (
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  commit.semverType === "major"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                                    : commit.semverType === "minor"
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
                                    : commit.semverType === "patch"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                                }`}
                              >
                                {commit.semverType}
                              </span>
                            )}
                            {commit.jiraTicketId && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300">
                                🎫 {commit.jiraTicketId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* API Documentation */}
        <div className="mt-16 text-center max-w-6xl mx-auto">
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600 dark:text-amber-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              API Documentation
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              You can also integrate this functionality into your applications using our REST API. Copy the complete URL below to use it
              directly:
            </p>
            <div className="bg-slate-900 dark:bg-slate-950 p-6 rounded-xl font-mono text-sm overflow-x-auto border">
              <div className="text-left space-y-4">
                {/* Complete URL */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-slate-400 text-xs">Complete API URL:</div>
                    <button
                      onClick={copyUrlToClipboard}
                      className="flex items-center space-x-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-md transition-colors duration-200"
                    >
                      {urlCopied ? (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-slate-800 dark:bg-slate-900 p-3 rounded border select-all">
                    <span className="text-amber-400">GET</span>{" "}
                    <span className="text-green-400 break-all">
                      {typeof window !== "undefined"
                        ? `${window.location.origin}${generateApiUrl()}`
                        : `http://localhost:3000${generateApiUrl()}`}
                    </span>
                  </div>
                </div>

                {/* Parameter breakdown */}
                <div className="space-y-2">
                  <div className="text-slate-400 text-xs">Parameter breakdown:</div>
                  <div className="space-y-1">
                    {generateApiUrl()
                      .split("?")[1]
                      ?.split("&")
                      .map((param, index) => {
                        const [key, value] = param.split("=");
                        const decodedValue = decodeURIComponent(value);
                        const isRequired = ["repo", "from", "to"].includes(key);
                        const isEmpty =
                          isRequired &&
                          ((key === "repo" && (!repo || repo === "https://github.com/owner/repository")) ||
                            (key === "from" && (!fromRef || fromRef === "v1.0.0")) ||
                            (key === "to" && (!toRef || toRef === "v2.0.0")));

                        return (
                          <div key={index} className="flex items-center text-sm">
                            <span className="text-blue-400 font-medium">{key}</span>
                            <span className="text-slate-400 mx-1">=</span>
                            <span className={`break-all ${isEmpty ? "text-red-400" : "text-yellow-400"}`}>{decodedValue}</span>
                            {isRequired && <span className="text-red-400 ml-2 text-xs">*required</span>}
                            {isEmpty && <span className="text-red-400 ml-2 text-xs">(placeholder)</span>}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 text-sm text-slate-500 dark:text-slate-400 text-left">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Parameter Descriptions:</h4>
                <ul className="space-y-1">
                  <li>
                    <span className="font-mono text-red-400">repo*</span> - GitHub repository URL
                  </li>
                  <li>
                    <span className="font-mono text-red-400">from*</span> - Starting Git reference (tag or commit hash)
                  </li>
                  <li>
                    <span className="font-mono text-red-400">to*</span> - Ending Git reference (tag or commit hash)
                  </li>
                  <li>
                    <span className="font-mono text-amber-400">targetDir</span> - Specific directory to analyze (optional)
                  </li>
                  <li>
                    <span className="font-mono text-amber-400">excludeSubPaths</span> - Comma-separated sub-paths to exclude from analysis
                    (optional)
                  </li>
                  <li>
                    <span className="font-mono text-amber-400">token</span> - GitHub personal access token for private repos (optional)
                  </li>
                </ul>
                <p className="mt-3 text-xs text-slate-400">
                  * Required parameters | Values in red are placeholders and need to be replaced with actual values
                </p>
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <h5 className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-2">excludeSubPaths Behavior:</h5>
                  <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    <p>• Comma-separated list of sub-paths relative to the target directory</p>
                    <p>
                      • Only descendant paths are allowed (no <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">/</code> or{" "}
                      <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">../</code>)
                    </p>
                    <p>• Matches files/folders that start with the specified path</p>
                    <p>
                      <strong>Example:</strong> If targetDir=<code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">src/a</code> and
                      excludeSubPaths=<code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">b,c/d,e</code>
                    </p>
                    <div className="ml-4 mt-1">
                      <p className="text-green-600 dark:text-green-400">
                        ✓ Includes: <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">src/a/readme.md</code>,{" "}
                        <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">src/a/example.json</code>
                      </p>
                      <p className="text-red-600 dark:text-red-400">
                        ✗ Excludes: <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">src/a/b/file.js</code>,{" "}
                        <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">src/a/c/d/test.js</code>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Streaming API Documentation */}
        <div className="mt-8 text-center max-w-6xl mx-auto">
          <div className="bg-blue-50/60 dark:bg-blue-900/20 backdrop-blur-sm rounded-2xl p-8 border border-blue-200/20">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
              </svg>
              Streaming API (No Timeout Limits)
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              For large repositories or complete commit analysis without timeout limits, use our streaming API. Perfect for Google Apps
              Script and other integrations.
            </p>

            <div className="bg-slate-900 dark:bg-slate-950 p-6 rounded-xl font-mono text-sm overflow-x-auto border">
              <div className="text-left space-y-4">
                <div className="space-y-2">
                  <div className="text-slate-400 text-xs">Streaming API URL:</div>
                  <div className="bg-slate-800 dark:bg-slate-900 p-3 rounded border select-all">
                    <span className="text-amber-400">GET</span>{" "}
                    <span className="text-green-400 break-all">
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/api/git-diff/stream${generateApiUrl().replace("/api/git-diff", "")}`
                        : `http://localhost:3000/api/git-diff/stream${generateApiUrl().replace("/api/git-diff", "")}`}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-slate-400 text-xs">Regular API with streaming:</div>
                  <div className="bg-slate-800 dark:bg-slate-900 p-3 rounded border select-all">
                    <span className="text-amber-400">GET</span>{" "}
                    <span className="text-green-400 break-all">
                      {typeof window !== "undefined"
                        ? `${window.location.origin}${generateApiUrl()}&stream=true`
                        : `http://localhost:3000${generateApiUrl()}&stream=true`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm text-slate-500 dark:text-slate-400 text-left">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-3">📡 Streaming Response Format</h4>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">Stream Endpoint (/stream):</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Returns JSON Lines format (one JSON object per line)</p>
                  </div>

                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">Regular Endpoint (?stream=true):</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Returns Server-Sent Events format</p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded text-xs font-mono">
                    <div className="text-green-400">// Start event</div>
                    <div className="text-white">{`{"type": "start", "repoUrl": "...", "timestamp": "..."}`}</div>
                    <div className="text-green-400 mt-2">// Progress updates</div>
                    <div className="text-white">{`{"type": "progress", "status": "Processing commits...", "timestamp": "..."}`}</div>
                    <div className="text-green-400 mt-2">// Commit batches</div>
                    <div className="text-white">{`{"type": "commits", "commits": [...], "progress": {"processed": 10, "total": 100}}`}</div>
                    <div className="text-green-400 mt-2">// Completion</div>
                    <div className="text-white">{`{"type": "complete", "success": true, "totalCommits": 100, "summary": {...}}`}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm text-slate-500 dark:text-slate-400 text-left">
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <h4 className="font-semibold text-green-700 dark:text-green-300 mb-3">📱 Google Apps Script Example</h4>
                <div className="bg-slate-900 p-3 rounded text-xs font-mono overflow-x-auto">
                  <div className="text-white">
                    {`function getGitCommits() {
  const url = 'https://your-domain.vercel.app/api/git-diff/stream';
  const params = '?repo=https://github.com/owner/repo&from=v1.0.0&to=v2.0.0';

  const response = UrlFetchApp.fetch(url + params);
  const lines = response.getContentText().split('\\n');

  let allCommits = [];

  lines.forEach(line => {
    if (line.trim()) {
      const data = JSON.parse(line);

      if (data.type === 'commits') {
        allCommits = allCommits.concat(data.commits);
        Logger.log(\`Progress: \${data.progress.processed}/\${data.progress.total}\`);
      } else if (data.type === 'complete') {
        Logger.log(\`Complete: \${data.totalCommits} commits processed\`);
      }
    }
  });

  return allCommits;
}`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

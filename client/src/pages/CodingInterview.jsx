import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../services/api";

// Lazy-load Monaco so it doesn't inflate the initial bundle
const Editor = lazy(() => import("@monaco-editor/react"));

// Language display labels
const LANGUAGE_LABELS = {
    python: "Python 3",
    javascript: "JavaScript",
    cpp: "C++",
};

// Map our language keys to Monaco language identifiers
const MONACO_LANGUAGE = {
    python: "python",
    javascript: "javascript",
    cpp: "cpp",
};

const CodingInterview = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [codingInterview, setCodingInterview] = useState(null);
    const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
    const [code, setCode] = useState("");

    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [completing, setCompleting] = useState(false);

    const [error, setError] = useState("");
    const [saveStatus, setSaveStatus] = useState(""); // "saved" | "saving" | ""

    // Auto-save timer ref
    const autoSaveTimerRef = useRef(null);
    // Track whether current code has unsaved changes
    const isDirtyRef = useRef(false);

    // Fetch interview on mount
    useEffect(() => {
        const fetchCodingInterview = async () => {
            try {
                const response = await api.get(`/coding-interviews/${id}`);
                const data = response.data.codingInterview;
                setCodingInterview(data);
                if (data.problems?.length > 0) {
                    setCode(
                        data.problems[0].solution ||
                        data.problems[0].starterCode ||
                        ""
                    );
                }
            } catch (err) {
                setError(
                    err.response?.data?.message || "Failed to load coding interview."
                );
            } finally {
                setLoading(false);
            }
        };

        fetchCodingInterview();
    }, [id]);

    // Cleanup auto-save timer on unmount
    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, []);

    // Sync code when switching problems
    const switchProblem = (index) => {
        if (!codingInterview?.problems) return;
        // Save current code before switching
        if (isDirtyRef.current) {
            triggerAutoSave(currentProblemIndex, code);
        }
        const problem = codingInterview.problems[index];
        setCode(problem.solution || problem.starterCode || "");
        setCurrentProblemIndex(index);
        setError("");
    };

    const triggerAutoSave = (problemIndex, codeValue) => {
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        setSaveStatus("saving");

        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                await api.post(`/coding-interviews/${id}/save-code`, {
                    problemIndex,
                    code: codeValue,
                });
                // Reflect saved code in local state
                setCodingInterview((prev) => {
                    if (!prev) return prev;
                    const updated = { ...prev };
                    updated.problems = [...prev.problems];
                    updated.problems[problemIndex] = {
                        ...updated.problems[problemIndex],
                        solution: codeValue,
                    };
                    return updated;
                });
                setSaveStatus("saved");
                isDirtyRef.current = false;
                setTimeout(() => setSaveStatus(""), 2000);
            } catch (_) {
                setSaveStatus("");
            }
        }, 1500);
    };

    const handleCodeChange = (newCode) => {
        setCode(newCode ?? "");
        isDirtyRef.current = true;
        triggerAutoSave(currentProblemIndex, newCode ?? "");
    };

    const handleGenerateProblems = async () => {
        try {
            setGenerating(true);
            setError("");
            const response = await api.post(`/coding-interviews/${id}/generate`);
            const data = response.data.codingInterview;
            setCodingInterview(data);
            setCurrentProblemIndex(0);
            setCode(
                data.problems[0]?.solution ||
                data.problems[0]?.starterCode ||
                ""
            );
        } catch (err) {
            setError(
                err.response?.data?.message || "Failed to generate problems."
            );
        } finally {
            setGenerating(false);
        }
    };

    const handleManualSave = async () => {
        if (saving) return;
        try {
            setSaving(true);
            setSaveStatus("saving");
            await api.post(`/coding-interviews/${id}/save-code`, {
                problemIndex: currentProblemIndex,
                code,
            });
            setCodingInterview((prev) => {
                if (!prev) return prev;
                const updated = { ...prev };
                updated.problems = [...prev.problems];
                updated.problems[currentProblemIndex] = {
                    ...updated.problems[currentProblemIndex],
                    solution: code,
                };
                return updated;
            });
            isDirtyRef.current = false;
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus(""), 2000);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save code.");
            setSaveStatus("");
        } finally {
            setSaving(false);
        }
    };

    const handleFinishInterview = async () => {
        if (completing) return;

        // Save current code first
        try {
            await api.post(`/coding-interviews/${id}/save-code`, {
                problemIndex: currentProblemIndex,
                code,
            });
        } catch (_) {
            // Non-blocking — proceed to completion
        }

        try {
            setCompleting(true);
            navigate(`/coding-interview/${id}/result`);
        } finally {
            setCompleting(false);
        }
    };

    // -------------------------------------------------------------------------
    // Loading / error states
    // -------------------------------------------------------------------------

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading">Loading coding interview...</div>
            </div>
        );
    }

    if (error && !codingInterview) {
        return (
            <div className="page-container">
                <div className="error-message">{error}</div>
                <Link to="/dashboard" className="btn btn-secondary" style={{ marginTop: "16px" }}>
                    ← Dashboard
                </Link>
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // Intro screen: interview has no problems generated yet
    // -------------------------------------------------------------------------

    if (!codingInterview?.problems?.length) {
        return (
            <div className="page-container">
                <div className="interview-intro">
                    <span style={{
                        display: "inline-block",
                        background: "#eef2ff",
                        color: "#4f46e5",
                        padding: "5px 12px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "700",
                        letterSpacing: "0.5px",
                        marginBottom: "18px"
                    }}>
                        CODING INTERVIEW
                    </span>

                    <h1>{codingInterview?.title || "Coding Interview"}</h1>

                    <p style={{ marginTop: "8px" }}>
                        <strong>Language:</strong>{" "}
                        {LANGUAGE_LABELS[codingInterview?.language] || codingInterview?.language}
                        {" "}·{" "}
                        <strong>Difficulty:</strong>{" "}
                        <span style={{ textTransform: "capitalize" }}>
                            {codingInterview?.difficulty}
                        </span>
                        {codingInterview?.topic && (
                            <>
                                {" "}·{" "}
                                <strong>Topic:</strong> {codingInterview.topic}
                            </>
                        )}
                    </p>

                    <p style={{ marginTop: "6px" }}>
                        <strong>Problems:</strong> {codingInterview?.problemCount || 3}
                    </p>

                    {error && (
                        <div className="error-message" style={{ marginTop: "16px" }}>
                            {error}
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        style={{ marginTop: "24px" }}
                        onClick={handleGenerateProblems}
                        disabled={generating}
                    >
                        {generating ? "Generating Problems…" : "Start Coding Interview"}
                    </button>
                </div>
            </div>
        );
    }

    const problem = codingInterview.problems[currentProblemIndex];
    const totalProblems = codingInterview.problems.length;
    const progress = ((currentProblemIndex + 1) / totalProblems) * 100;
    const isLastProblem = currentProblemIndex === totalProblems - 1;
    const langKey = codingInterview.language;

    // -------------------------------------------------------------------------
    // Main coding interview layout
    // -------------------------------------------------------------------------

    return (
        <div className="page-container" style={{ maxWidth: "1400px", padding: "28px 24px" }}>

            {/* ---- Header ---- */}
            <div className="interview-header">
                <div>
                    <h1 style={{ fontSize: "22px", marginBottom: "4px" }}>
                        {codingInterview.title}
                    </h1>
                    <p style={{ fontSize: "13px" }}>
                        {LANGUAGE_LABELS[langKey]} · {codingInterview.difficulty} difficulty
                    </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {saveStatus === "saving" && (
                        <span style={{ fontSize: "12px", color: "#667085" }}>Saving…</span>
                    )}
                    {saveStatus === "saved" && (
                        <span style={{ fontSize: "12px", color: "#16a34a" }}>✓ Saved</span>
                    )}
                    <div className="question-counter">
                        Problem {currentProblemIndex + 1} / {totalProblems}
                    </div>
                </div>
            </div>

            {/* ---- Progress bar ---- */}
            <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>

            {/* ---- Problem navigation tabs ---- */}
            <div style={{
                display: "flex",
                gap: "8px",
                marginBottom: "20px",
                flexWrap: "wrap"
            }}>
                {codingInterview.problems.map((p, idx) => (
                    <button
                        key={idx}
                        onClick={() => switchProblem(idx)}
                        style={{
                            padding: "6px 14px",
                            borderRadius: "20px",
                            border: "1px solid",
                            borderColor: idx === currentProblemIndex ? "#4f46e5" : "#d0d5dd",
                            background: idx === currentProblemIndex ? "#4f46e5" : "#ffffff",
                            color: idx === currentProblemIndex ? "#ffffff" : "#475467",
                            fontWeight: "600",
                            fontSize: "13px",
                            cursor: "pointer",
                            transition: "0.15s",
                        }}
                    >
                        {idx + 1}. {p.title || `Problem ${idx + 1}`}
                        {p.submitted && (
                            <span style={{ marginLeft: "6px", fontSize: "11px" }}>✓</span>
                        )}
                    </button>
                ))}
            </div>

            {error && (
                <div className="error-message" style={{ marginBottom: "16px" }}>{error}</div>
            )}

            {/* ---- Main two-column grid ---- */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(300px, 420px) 1fr",
                gap: "20px",
                alignItems: "start",
            }}>

                {/* ==== Left: Problem Panel ==== */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                    {/* Problem statement */}
                    <div style={{
                        background: "#ffffff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        padding: "24px",
                    }}>
                        <span className="question-label">Problem {currentProblemIndex + 1}</span>

                        <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>
                            {problem.title || `Problem ${currentProblemIndex + 1}`}
                        </h2>

                        {/* Render problem text — preserve markdown-like line breaks */}
                        <div style={{
                            fontSize: "14px",
                            lineHeight: "1.75",
                            color: "#344054",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                        }}>
                            {problem.problem}
                        </div>
                    </div>

                    {/* Example I/O */}
                    {(problem.exampleInput || problem.exampleOutput) && (
                        <div style={{
                            background: "#f8fafc",
                            border: "1px solid #e5e7eb",
                            borderRadius: "10px",
                            padding: "18px",
                        }}>
                            <p style={{
                                fontSize: "11px",
                                fontWeight: "700",
                                letterSpacing: "0.8px",
                                color: "#667085",
                                marginBottom: "12px",
                                textTransform: "uppercase"
                            }}>
                                Example
                            </p>

                            {problem.exampleInput && (
                                <div style={{ marginBottom: "10px" }}>
                                    <p style={{ fontSize: "12px", fontWeight: "600", color: "#475467", marginBottom: "4px" }}>
                                        Input:
                                    </p>
                                    <code style={{
                                        display: "block",
                                        background: "#1e293b",
                                        color: "#e2e8f0",
                                        padding: "10px 12px",
                                        borderRadius: "6px",
                                        fontSize: "12px",
                                        whiteSpace: "pre-wrap",
                                        fontFamily: "'Fira Code', 'Cascadia Code', monospace"
                                    }}>
                                        {problem.exampleInput}
                                    </code>
                                </div>
                            )}

                            {problem.exampleOutput && (
                                <div>
                                    <p style={{ fontSize: "12px", fontWeight: "600", color: "#475467", marginBottom: "4px" }}>
                                        Output:
                                    </p>
                                    <code style={{
                                        display: "block",
                                        background: "#1e293b",
                                        color: "#4ade80",
                                        padding: "10px 12px",
                                        borderRadius: "6px",
                                        fontSize: "12px",
                                        whiteSpace: "pre-wrap",
                                        fontFamily: "'Fira Code', 'Cascadia Code', monospace"
                                    }}>
                                        {problem.exampleOutput}
                                    </code>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Custom input (for Stage 2 test runs) */}
                    <div style={{
                        background: "#ffffff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "10px",
                        padding: "18px",
                    }}>
                        <p style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            letterSpacing: "0.8px",
                            color: "#667085",
                            marginBottom: "10px",
                            textTransform: "uppercase"
                        }}>
                            Custom Test Input
                        </p>
                        <textarea
                            placeholder="Enter custom stdin here (available when Run is enabled)"
                            rows={4}
                            disabled
                            style={{
                                width: "100%",
                                padding: "10px 12px",
                                border: "1px solid #d0d5dd",
                                borderRadius: "8px",
                                resize: "vertical",
                                fontSize: "13px",
                                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                                background: "#f9fafb",
                                color: "#9ca3af",
                                cursor: "not-allowed",
                            }}
                        />
                        <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "6px" }}>
                            Code execution (Run) is coming in Stage 2.
                        </p>
                    </div>

                </div>

                {/* ==== Right: Editor + Actions ==== */}
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                    {/* Language label + editor header */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#1e293b",
                        padding: "10px 16px",
                        borderRadius: "10px 10px 0 0",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{
                                background: "#4f46e5",
                                color: "#ffffff",
                                padding: "3px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "700"
                            }}>
                                {LANGUAGE_LABELS[langKey] || langKey}
                            </span>
                            <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                                {problem.title || `Problem ${currentProblemIndex + 1}`}
                            </span>
                        </div>

                        {/* Save indicator */}
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                            {saveStatus === "saving" ? "● Saving…" : saveStatus === "saved" ? "✓ Saved" : ""}
                        </div>
                    </div>

                    {/* Monaco Editor */}
                    <div style={{
                        borderRadius: "0 0 10px 10px",
                        overflow: "hidden",
                        border: "1px solid #1e293b",
                        borderTop: "none",
                        minHeight: "400px",
                    }}>
                        <Suspense fallback={
                            <div style={{
                                height: "420px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "#1e293b",
                                color: "#94a3b8",
                                fontSize: "14px"
                            }}>
                                Loading editor…
                            </div>
                        }>
                            <Editor
                                height="440px"
                                language={MONACO_LANGUAGE[langKey] || "plaintext"}
                                value={code}
                                onChange={handleCodeChange}
                                theme="vs-dark"
                                options={{
                                    fontSize: 14,
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    wordWrap: "on",
                                    lineNumbers: "on",
                                    tabSize: langKey === "python" ? 4 : 2,
                                    insertSpaces: true,
                                    automaticLayout: true,
                                    padding: { top: 14, bottom: 14 },
                                }}
                            />
                        </Suspense>
                    </div>

                    {/* Action Row */}
                    <div style={{
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap",
                        alignItems: "center"
                    }}>
                        {/* Manual Save */}
                        <button
                            className="btn btn-secondary"
                            onClick={handleManualSave}
                            disabled={saving}
                            style={{ fontSize: "13px" }}
                        >
                            {saving ? "Saving…" : "Save Code"}
                        </button>

                        {/* Run Code (placeholder — Stage 2) */}
                        <button
                            className="btn"
                            disabled
                            title="Code execution coming in Stage 2"
                            style={{
                                background: "#f0fdf4",
                                color: "#9ca3af",
                                border: "1px solid #d1fae5",
                                cursor: "not-allowed",
                                fontSize: "13px",
                            }}
                        >
                            ▷ Run Code
                        </button>

                        <div style={{ flex: 1 }} />

                        {/* Next Problem / Finish */}
                        {!isLastProblem ? (
                            <button
                                className="btn btn-primary"
                                onClick={() => switchProblem(currentProblemIndex + 1)}
                                style={{ fontSize: "13px" }}
                            >
                                Next Problem →
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary"
                                onClick={handleFinishInterview}
                                disabled={completing}
                                style={{ fontSize: "13px" }}
                            >
                                {completing ? "Finishing…" : "Finish Interview"}
                            </button>
                        )}
                    </div>

                    {/* Output panel placeholder */}
                    <div style={{
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "10px",
                        padding: "16px",
                        minHeight: "100px",
                    }}>
                        <p style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            letterSpacing: "0.8px",
                            color: "#475467",
                            marginBottom: "10px",
                            textTransform: "uppercase"
                        }}>
                            Output
                        </p>
                        <p style={{ color: "#64748b", fontSize: "13px", fontStyle: "italic" }}>
                            Run Code output will appear here (available in Stage 2).
                        </p>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default CodingInterview;
